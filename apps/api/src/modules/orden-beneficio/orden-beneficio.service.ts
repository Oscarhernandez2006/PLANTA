import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrdenBeneficio, OrdenBeneficioStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthContext } from '../../common/auth/auth-context';
import { CreateOrdenBeneficioDto } from './dto/create-orden-beneficio.dto';

function dateOnly(s?: string) {
  const str = s ?? new Date().toISOString().slice(0, 10);
  return { str, date: new Date(`${str}T00:00:00.000Z`) };
}

export interface GuiaDetalle {
  guia: string;
  corrales: string[];
  animalesEnPie: number;
  asignados: number;
  disponibles: number;
}

export interface Candidate {
  cliente: string;
  guiasDetalle: GuiaDetalle[];
  totalDisponibles: number;
}

@Injectable()
export class OrdenBeneficioService {
  constructor(private readonly prisma: PrismaService) {}

  private toDto(r: OrdenBeneficio, insensibilizados = 0) {
    return {
      id: r.id,
      reference: r.reference,
      date: r.date.toISOString().slice(0, 10),
      cliente: r.cliente,
      guias: r.guias,
      animalCount: r.animalCount,
      observaciones: r.observaciones,
      status: r.status,
      insensibilizados,
    };
  }

  /**
   * Reúne los datos del día: guías por cliente (Peso en Camión), animales
   * validados por guía (Peso en Pie) y animales ya asignados a lotes por guía
   * (Órdenes de Beneficio existentes).
   */
  private async aggregate(ctx: AuthContext, date: Date) {
    const [camiones, pesosEnPie, ordenes] = await Promise.all([
      this.prisma.pesoCamion.findMany({
        where: { plantId: ctx.plantId, date, deletedAt: null },
        select: { cliente: true, guia: true },
      }),
      this.prisma.pesoEnPie.findMany({
        where: { plantId: ctx.plantId, date, deletedAt: null },
        select: { guia: true, animalCount: true, corral: true },
      }),
      this.prisma.ordenBeneficio.findMany({
        where: { plantId: ctx.plantId, date, deletedAt: null },
        select: { guias: true, animalCount: true },
      }),
    ]);

    // Animales de Peso en Pie por guía.
    const enPiePorGuia = new Map<string, number>();
    const corralesPorGuia = new Map<string, Set<string>>();
    for (const p of pesosEnPie) {
      const g = p.guia?.trim();
      if (!g) continue;
      enPiePorGuia.set(g, (enPiePorGuia.get(g) ?? 0) + p.animalCount);
      const corral = p.corral?.trim();
      if (corral) {
        const set = corralesPorGuia.get(g) ?? new Set<string>();
        set.add(corral);
        corralesPorGuia.set(g, set);
      }
    }

    // Animales ya asignados a lotes por guía.
    const asignadoPorGuia = new Map<string, number>();
    for (const o of ordenes) {
      for (const g of o.guias) {
        const key = g.trim();
        if (!key) continue;
        asignadoPorGuia.set(key, (asignadoPorGuia.get(key) ?? 0) + o.animalCount);
      }
    }

    // Guías de Peso en Camión agrupadas por cliente.
    const porCliente = new Map<string, Set<string>>();
    for (const c of camiones) {
      const cliente = c.cliente?.trim();
      const g = c.guia?.trim();
      if (!cliente || !g) continue;
      const set = porCliente.get(cliente) ?? new Set<string>();
      set.add(g);
      porCliente.set(cliente, set);
    }

    return { porCliente, enPiePorGuia, asignadoPorGuia, corralesPorGuia };
  }

  /** Clientes del día con sus guías y animales disponibles por guía. */
  async candidates(ctx: AuthContext, dateStr?: string): Promise<Candidate[]> {
    const { date } = dateOnly(dateStr);
    const { porCliente, enPiePorGuia, asignadoPorGuia, corralesPorGuia } =
      await this.aggregate(ctx, date);

    const list: Candidate[] = [];
    for (const [cliente, guias] of porCliente) {
      const guiasDetalle: GuiaDetalle[] = [...guias].sort().map((guia) => {
        const animalesEnPie = enPiePorGuia.get(guia) ?? 0;
        const asignados = asignadoPorGuia.get(guia) ?? 0;
        const corrales = [...(corralesPorGuia.get(guia) ?? [])].sort();
        return {
          guia,
          corrales,
          animalesEnPie,
          asignados,
          disponibles: Math.max(0, animalesEnPie - asignados),
        };
      });
      const totalDisponibles = guiasDetalle.reduce(
        (sum, g) => sum + g.disponibles,
        0,
      );
      list.push({ cliente, guiasDetalle, totalDisponibles });
    }
    list.sort((a, b) => a.cliente.localeCompare(b.cliente));
    return list;
  }

  /** Crea un lote de beneficio con una parte (o el total) de una guía. */
  async create(ctx: AuthContext, dto: CreateOrdenBeneficioDto) {
    const { str, date } = dateOnly(dto.date);
    const cliente = dto.cliente.trim();
    const guia = dto.guia.trim();
    if (!cliente) throw new BadRequestException('Cliente requerido.');
    if (!guia) throw new BadRequestException('Guía requerida.');
    if (dto.animalCount < 1) {
      throw new BadRequestException('La cantidad debe ser mayor a cero.');
    }

    return this.prisma.$transaction(async (tx) => {
      // Serializa la creación de lotes por planta y día (referencia y cupos).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${ctx.plantId}:${str}:ob`}))`;

      // La guía debe pertenecer al cliente en Peso en Camión.
      const camion = await tx.pesoCamion.findFirst({
        where: { plantId: ctx.plantId, date, cliente, guia, deletedAt: null },
        select: { id: true },
      });
      if (!camion) {
        throw new BadRequestException(
          'La guía no corresponde al cliente en Peso en Camión.',
        );
      }

      // Animales validados en Peso en Pie para la guía.
      const pie = await tx.pesoEnPie.aggregate({
        _sum: { animalCount: true },
        where: { plantId: ctx.plantId, date, guia, deletedAt: null },
      });
      const enPie = pie._sum.animalCount ?? 0;
      if (enPie <= 0) {
        throw new BadRequestException(
          'La guía no tiene animales validados en Peso en Pie.',
        );
      }

      // Animales ya asignados a lotes de esta guía.
      const ordenesGuia = await tx.ordenBeneficio.findMany({
        where: { plantId: ctx.plantId, date, guias: { has: guia }, deletedAt: null },
        select: { animalCount: true },
      });
      const asignados = ordenesGuia.reduce((s, o) => s + o.animalCount, 0);
      const disponibles = enPie - asignados;
      if (disponibles <= 0) {
        throw new BadRequestException(
          'La guía ya tiene todos sus animales asignados a lotes.',
        );
      }
      if (dto.animalCount > disponibles) {
        throw new BadRequestException(
          `Solo quedan ${disponibles} animales disponibles en la guía ${guia}.`,
        );
      }

      const agg = await tx.ordenBeneficio.aggregate({
        _max: { reference: true },
        where: { plantId: ctx.plantId, date, deletedAt: null },
      });
      const reference = (agg._max.reference ?? 0) + 1;

      const rec = await tx.ordenBeneficio.create({
        data: {
          plantId: ctx.plantId,
          reference,
          date,
          cliente,
          guias: [guia],
          animalCount: dto.animalCount,
          observaciones: dto.observaciones?.trim() || null,
          createdById: ctx.userId,
        },
      });
      return this.toDto(rec);
    });
  }

  async findAll(ctx: AuthContext, dateStr?: string) {
    const where = { plantId: ctx.plantId, deletedAt: null } as {
      plantId: string;
      deletedAt: null;
      date?: Date;
    };
    if (dateStr) where.date = dateOnly(dateStr).date;

    const rows = await this.prisma.ordenBeneficio.findMany({
      where,
      orderBy: [{ date: 'desc' }, { reference: 'desc' }],
      include: { _count: { select: { eventos: true } } },
      take: 200,
    });
    return rows.map((r) => this.toDto(r, r._count.eventos));
  }

  async findOne(ctx: AuthContext, id: string) {
    const rec = await this.prisma.ordenBeneficio.findFirst({
      where: { id, plantId: ctx.plantId, deletedAt: null },
      include: { _count: { select: { eventos: true } } },
    });
    if (!rec) throw new NotFoundException('Orden de Beneficio no encontrada.');
    return this.toDto(rec, rec._count.eventos);
  }

  async remove(ctx: AuthContext, id: string) {
    const rec = await this.prisma.ordenBeneficio.findFirst({
      where: { id, plantId: ctx.plantId, deletedAt: null },
    });
    if (!rec) throw new NotFoundException('Orden de Beneficio no encontrada.');
    if (rec.status !== OrdenBeneficioStatus.pendiente) {
      throw new BadRequestException(
        'Solo se puede eliminar una orden pendiente (sin insensibilización).',
      );
    }
    await this.prisma.ordenBeneficio.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { ok: true };
  }
}
