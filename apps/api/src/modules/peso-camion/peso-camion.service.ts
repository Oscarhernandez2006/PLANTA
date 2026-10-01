import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PesoCamion, PesoCamionStatus, PesoEnPieStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthContext } from '../../common/auth/auth-context';
import { SavePesoCamionDto } from './dto/save-peso-camion.dto';
import { plantToday } from '../../common/plant-date';

function dateOnly(s?: string) {
  const str = s ?? plantToday();
  return { str, date: new Date(`${str}T00:00:00.000Z`) };
}

@Injectable()
export class PesoCamionService {
  constructor(private readonly prisma: PrismaService) {}

  private toDto(r: PesoCamion) {
    return {
      id: r.id,
      reference: r.reference,
      date: r.date.toISOString().slice(0, 10),
      guia: r.guia,
      procedencia: r.procedencia,
      proveedor: r.proveedor,
      cliente: r.cliente,
      placa: r.placa,
      conductor: r.conductor,
      observaciones: r.observaciones,
      cantidad: r.cantidad,
      entrada: r.entrada == null ? null : Number(r.entrada),
      salida: r.salida == null ? null : Number(r.salida),
      neto: r.netoKg == null ? null : Number(r.netoKg),
      pesoPromedioKg: r.pesoPromedioKg == null ? null : Number(r.pesoPromedioKg),
      status: r.status,
      pieStatus: r.pieStatus,
    };
  }

  /** Próximo consecutivo global de referencia para la planta (producción). */
  async nextReference(ctx: AuthContext) {
    const agg = await this.prisma.pesoCamion.aggregate({
      _max: { reference: true },
      where: { plantId: ctx.plantId, deletedAt: null },
    });
    return { next: (agg._max.reference ?? 0) + 1 };
  }

  /** Próximo consecutivo de guía temporal (TEMP-000001) para la planta. */
  async nextTempGuia(ctx: AuthContext) {
    const rows = await this.prisma.pesoCamion.findMany({
      where: {
        plantId: ctx.plantId,
        guia: { startsWith: 'TEMP-' },
      },
      select: { guia: true },
    });
    let max = 0;
    for (const r of rows) {
      const n = parseInt((r.guia ?? '').replace('TEMP-', ''), 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
    return { next: `TEMP-${String(max + 1).padStart(6, '0')}` };
  }

  private fields(dto: SavePesoCamionDto) {
    return {
      guia: dto.guia ?? null,
      procedencia: dto.procedencia ?? null,
      proveedor: dto.proveedor ?? null,
      cliente: dto.cliente ?? null,
      placa: dto.placa ?? null,
      conductor: dto.conductor ?? null,
      observaciones: dto.observaciones ?? null,
      cantidad: dto.cantidad ?? null,
      entrada: dto.entrada ?? null,
      salida: dto.salida ?? null,
      netoKg: dto.neto ?? null,
      pesoPromedioKg: dto.pesoPromedioKg ?? null,
    };
  }

  /** Verifica que la guía (número real, no TEMP-) no se haya usado antes en la planta. */
  private async assertGuiaDisponible(
    ctx: AuthContext,
    guia: string | null | undefined,
    excludeId?: string,
  ) {
    const valor = guia?.trim();
    if (!valor || valor.toUpperCase().startsWith('TEMP-')) return;
    const repetida = await this.prisma.pesoCamion.findFirst({
      where: {
        plantId: ctx.plantId,
        deletedAt: null,
        guia: { equals: valor, mode: 'insensitive' },
        ...(excludeId && { id: { not: excludeId } }),
      },
      select: { reference: true },
    });
    if (repetida) {
      throw new BadRequestException(
        `La guía "${valor}" ya se usó en la referencia ${repetida.reference}.`,
      );
    }
  }

  async create(ctx: AuthContext, dto: SavePesoCamionDto) {
    await this.assertGuiaDisponible(ctx, dto.guia);
    const { date } = dateOnly(dto.date);
    return this.prisma.$transaction(async (tx) => {
      // Serializa el consecutivo global de referencia por planta.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${ctx.plantId}:pc`}))`;
      const agg = await tx.pesoCamion.aggregate({
        _max: { reference: true },
        where: { plantId: ctx.plantId, deletedAt: null },
      });
      const reference = (agg._max.reference ?? 0) + 1;
      const rec = await tx.pesoCamion.create({
        data: {
          plantId: ctx.plantId,
          reference,
          date,
          createdById: ctx.userId,
          ...this.fields(dto),
        },
      });
      return this.toDto(rec);
    });
  }

  async update(ctx: AuthContext, id: string, dto: SavePesoCamionDto) {
    const existing = await this.prisma.pesoCamion.findFirst({
      where: { id, plantId: ctx.plantId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Guía no encontrada.');
    await this.assertGuiaDisponible(ctx, dto.guia, id);

    const rec = await this.prisma.pesoCamion.update({
      where: { id },
      data: this.fields(dto),
    });
    return this.toDto(rec);
  }

  /** Cierra la guía (sale de la lista de abiertas). */
  async close(ctx: AuthContext, id: string) {
    const existing = await this.prisma.pesoCamion.findFirst({
      where: { id, plantId: ctx.plantId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Guía no encontrada.');

    // El total pesado uno a uno en Peso en Pie debe coincidir (±25%) con el
    // neto pesado en camión; solo se valida si Peso en Pie ya cerró la guía.
    const guia = existing.guia?.trim();
    const neto = existing.netoKg == null ? null : Number(existing.netoKg);
    if (guia && neto != null && existing.pieStatus === PesoCamionStatus.cerrada) {
      const enPie = await this.prisma.pesoEnPie.aggregate({
        _sum: { pesoTotalKg: true },
        where: { plantId: ctx.plantId, date: existing.date, guia, deletedAt: null },
      });
      const totalPie = Number(enPie._sum.pesoTotalKg ?? 0);
      const min = neto * 0.75;
      const max = neto * 1.25;
      if (totalPie < min || totalPie > max) {
        throw new BadRequestException(
          'Los pesos de báscula camión y báscula en pie no coinciden.',
        );
      }
    }

    const rec = await this.prisma.pesoCamion.update({
      where: { id },
      data: { status: PesoCamionStatus.cerrada },
    });
    return this.toDto(rec);
  }

  /**
   * Cierra la guía en Peso en Pie (independiente del camión): sus animales
   * pasan a beneficio y la guía sale de la lista de Peso en Pie.
   */
  async closePie(ctx: AuthContext, id: string) {
    const existing = await this.prisma.pesoCamion.findFirst({
      where: { id, plantId: ctx.plantId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Guía no encontrada.');
    if (existing.pieStatus === PesoCamionStatus.cerrada) {
      throw new BadRequestException('La guía ya está cerrada en Peso en Pie.');
    }
    const guia = existing.guia?.trim();
    if (!guia) throw new BadRequestException('La guía no tiene número.');

    const rec = await this.prisma.$transaction(async (tx) => {
      const animales = await tx.pesoEnPie.updateMany({
        where: {
          plantId: ctx.plantId,
          date: existing.date,
          guia,
          deletedAt: null,
          status: PesoEnPieStatus.pendiente,
        },
        data: { status: PesoEnPieStatus.en_insensibilizacion },
      });
      const pesados = await tx.pesoEnPie.count({
        where: { plantId: ctx.plantId, date: existing.date, guia, deletedAt: null },
      });
      if (!animales.count && !pesados) {
        throw new BadRequestException('No hay animales pesados en esta guía.');
      }
      return tx.pesoCamion.update({
        where: { id },
        data: { pieStatus: PesoCamionStatus.cerrada },
      });
    });
    return this.toDto(rec);
  }

  async findAll(ctx: AuthContext, status?: PesoCamionStatus, pieStatus?: PesoCamionStatus) {
    const rows = await this.prisma.pesoCamion.findMany({
      where: {
        plantId: ctx.plantId,
        deletedAt: null,
        ...(pieStatus ? { pieStatus } : { status: status ?? PesoCamionStatus.abierta }),
      },
      orderBy: [{ date: 'desc' }, { reference: 'desc' }],
      take: 1000,
    });
    return rows.map((r) => this.toDto(r));
  }

  async findOne(ctx: AuthContext, id: string) {
    const rec = await this.prisma.pesoCamion.findFirst({
      where: { id, plantId: ctx.plantId, deletedAt: null },
    });
    if (!rec) throw new NotFoundException('Guía no encontrada.');
    return this.toDto(rec);
  }
}
