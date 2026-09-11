import { Injectable, NotFoundException } from '@nestjs/common';
import { PesoCamion, PesoCamionStatus } from '@prisma/client';
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
      status: r.status,
    };
  }

  /** Próxima referencia (orden de llegada) del día para la planta. */
  async nextReference(ctx: AuthContext, dateStr?: string) {
    const { date } = dateOnly(dateStr);
    const agg = await this.prisma.pesoCamion.aggregate({
      _max: { reference: true },
      where: { plantId: ctx.plantId, date, deletedAt: null },
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
    };
  }

  async create(ctx: AuthContext, dto: SavePesoCamionDto) {
    const { str, date } = dateOnly(dto.date);
    return this.prisma.$transaction(async (tx) => {
      // Serializa la numeración de referencia por planta y día.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${ctx.plantId}:${str}:pc`}))`;
      const agg = await tx.pesoCamion.aggregate({
        _max: { reference: true },
        where: { plantId: ctx.plantId, date, deletedAt: null },
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

    const rec = await this.prisma.pesoCamion.update({
      where: { id },
      data: { status: PesoCamionStatus.cerrada },
    });
    return this.toDto(rec);
  }

  async findAll(ctx: AuthContext, status?: PesoCamionStatus) {
    const rows = await this.prisma.pesoCamion.findMany({
      where: {
        plantId: ctx.plantId,
        deletedAt: null,
        status: status ?? PesoCamionStatus.abierta,
      },
      orderBy: [{ date: 'desc' }, { reference: 'desc' }],
      take: 200,
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
