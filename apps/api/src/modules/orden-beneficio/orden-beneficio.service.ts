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

export interface Candidate {
  cliente: string;
  guias: string[];
  guiasDetalle: { guia: string; animalesEnPie: number }[];
  camionCantidad: number;
  animalesEnPie: number;
  yaCreada: boolean;
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
      animalesDisponibles: r.animalesDisponibles,
      animalCount: r.animalCount,
      observaciones: r.observaciones,
      status: r.status,
      insensibilizados,
    };
  }

  /**
   * Agrupa por cliente los animales del día: guías registradas en Peso en
   * Camión cruzadas (por guía) con los animales validados en Peso en Pie.
   */
  private async aggregate(ctx: AuthContext, date: Date) {
    const [camiones, pesosEnPie, ordenes] = await Promise.all([
      this.prisma.pesoCamion.findMany({
        where: { plantId: ctx.plantId, date, deletedAt: null },
        select: { cliente: true, guia: true, cantidad: true },
      }),
      this.prisma.pesoEnPie.findMany({
        where: { plantId: ctx.plantId, date, deletedAt: null },
        select: { guia: true, animalCount: true },
      }),
      this.prisma.ordenBeneficio.findMany({
        where: { plantId: ctx.plantId, date, deletedAt: null },
        select: { cliente: true },
      }),
    ]);

    // Suma de animales de Peso en Pie por guía.
    const enPiePorGuia = new Map<string, number>();
    for (const p of pesosEnPie) {
      const g = p.guia?.trim();
      if (!g) continue;
      enPiePorGuia.set(g, (enPiePorGuia.get(g) ?? 0) + p.animalCount);
    }

    const yaCreadas = new Set(ordenes.map((o) => o.cliente));

    // Agrupa las guías de Peso en Camión por cliente.
    const porCliente = new Map<
      string,
      { guias: Set<string>; camionCantidad: number }
    >();
    for (const c of camiones) {
      const cliente = c.cliente?.trim();
      if (!cliente) continue;
      const entry =
        porCliente.get(cliente) ??
        { guias: new Set<string>(), camionCantidad: 0 };
      const g = c.guia?.trim();
      if (g) entry.guias.add(g);
      entry.camionCantidad += c.cantidad ?? 0;
      porCliente.set(cliente, entry);
    }

    return { porCliente, enPiePorGuia, yaCreadas };
  }

  /** Clientes del día candidatos a generar una Orden de Beneficio. */
  async candidates(ctx: AuthContext, dateStr?: string): Promise<Candidate[]> {
    const { date } = dateOnly(dateStr);
    const { porCliente, enPiePorGuia, yaCreadas } = await this.aggregate(
      ctx,
      date,
    );

    const list: Candidate[] = [];
    for (const [cliente, { guias, camionCantidad }] of porCliente) {
      const guiasArr = [...guias].sort();
      const guiasDetalle = guiasArr.map((guia) => ({
        guia,
        animalesEnPie: enPiePorGuia.get(guia) ?? 0,
      }));
      const animalesEnPie = guiasDetalle.reduce(
        (sum, g) => sum + g.animalesEnPie,
        0,
      );
      list.push({
        cliente,
        guias: guiasArr,
        guiasDetalle,
        camionCantidad,
        animalesEnPie,
        yaCreada: yaCreadas.has(cliente),
      });
    }
    list.sort((a, b) => a.cliente.localeCompare(b.cliente));
    return list;
  }

  async create(ctx: AuthContext, dto: CreateOrdenBeneficioDto) {
    const { str, date } = dateOnly(dto.date);
    const cliente = dto.cliente.trim();
    if (!cliente) throw new BadRequestException('Cliente requerido.');

    const built = await this.buildForCliente(ctx, date, cliente);
    if (built.error === 'sin-camion') {
      throw new BadRequestException(
        'El cliente no tiene registros en Peso en Camión para la fecha.',
      );
    }
    if (built.animalesDisponibles <= 0) {
      throw new BadRequestException(
        'El cliente no tiene animales validados en Peso en Pie.',
      );
    }

    const rec = await this.persist(ctx, str, date, {
      cliente: built.cliente,
      guias: built.guias,
      animalesDisponibles: built.animalesDisponibles,
      observaciones: dto.observaciones?.trim() || null,
      throwIfExists: true,
    });
    return this.toDto(rec!);
  }

  /**
   * Crea automáticamente la Orden de Beneficio del cliente (al cerrar una guía
   * en Peso en Camión). No falla si aún no hay animales o si ya existe: solo
   * devuelve null en esos casos.
   */
  async ensureForCliente(
    ctx: AuthContext,
    clienteRaw: string | null | undefined,
    dateStr?: string,
  ) {
    const cliente = clienteRaw?.trim();
    if (!cliente) return null;
    const { str, date } = dateOnly(dateStr);
    const built = await this.buildForCliente(ctx, date, cliente);
    if (built.error || built.animalesDisponibles <= 0) return null;
    try {
      const rec = await this.persist(ctx, str, date, {
        cliente: built.cliente,
        guias: built.guias,
        animalesDisponibles: built.animalesDisponibles,
        observaciones: null,
        throwIfExists: false,
      });
      return rec ? this.toDto(rec) : null;
    } catch {
      return null;
    }
  }

  /** Ajusta cuántos animales se van a sacrificar (≤ disponibles en Peso en Pie). */
  async updateCount(ctx: AuthContext, id: string, animalCount: number) {
    const rec = await this.prisma.ordenBeneficio.findFirst({
      where: { id, plantId: ctx.plantId, deletedAt: null },
    });
    if (!rec) throw new NotFoundException('Orden de Beneficio no encontrada.');
    if (rec.status !== OrdenBeneficioStatus.pendiente) {
      throw new BadRequestException(
        'Solo se puede cambiar la cantidad de una orden pendiente.',
      );
    }
    if (animalCount > rec.animalesDisponibles) {
      throw new BadRequestException(
        `Máximo ${rec.animalesDisponibles} animales disponibles en Peso en Pie.`,
      );
    }
    const updated = await this.prisma.ordenBeneficio.update({
      where: { id },
      data: { animalCount },
    });
    return this.toDto(updated);
  }

  /** Calcula guías y animales disponibles del cliente en la fecha. */
  private async buildForCliente(
    ctx: AuthContext,
    date: Date,
    clienteRaw: string,
  ) {
    const cliente = clienteRaw.trim();
    const { porCliente, enPiePorGuia } = await this.aggregate(ctx, date);
    const entry = porCliente.get(cliente);
    if (!entry) {
      return { cliente, guias: [] as string[], animalesDisponibles: 0, error: 'sin-camion' as const };
    }
    const guias = [...entry.guias].sort();
    const animalesDisponibles = guias.reduce(
      (sum, g) => sum + (enPiePorGuia.get(g) ?? 0),
      0,
    );
    return { cliente, guias, animalesDisponibles, error: null };
  }

  private async persist(
    ctx: AuthContext,
    str: string,
    date: Date,
    data: {
      cliente: string;
      guias: string[];
      animalesDisponibles: number;
      observaciones: string | null;
      throwIfExists: boolean;
    },
  ): Promise<OrdenBeneficio | null> {
    return this.prisma.$transaction(async (tx) => {
      // Serializa la numeración de referencia por planta y día.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${ctx.plantId}:${str}:ob`}))`;

      const existing = await tx.ordenBeneficio.findFirst({
        where: { plantId: ctx.plantId, date, cliente: data.cliente, deletedAt: null },
      });
      if (existing) {
        if (data.throwIfExists) {
          throw new BadRequestException(
            'Ya existe una Orden de Beneficio para este cliente hoy.',
          );
        }
        return null;
      }

      const agg = await tx.ordenBeneficio.aggregate({
        _max: { reference: true },
        where: { plantId: ctx.plantId, date, deletedAt: null },
      });
      const reference = (agg._max.reference ?? 0) + 1;

      return tx.ordenBeneficio.create({
        data: {
          plantId: ctx.plantId,
          reference,
          date,
          cliente: data.cliente,
          guias: data.guias,
          animalesDisponibles: data.animalesDisponibles,
          animalCount: data.animalesDisponibles,
          observaciones: data.observaciones,
          createdById: ctx.userId,
        },
      });
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
