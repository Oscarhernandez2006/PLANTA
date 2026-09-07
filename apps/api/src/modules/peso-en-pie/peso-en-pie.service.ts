import { Injectable, NotFoundException } from '@nestjs/common';
import {
  PesoEnPie,
  PesoEnPieStatus,
  PesoEnPieTipoPesaje,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthContext } from '../../common/auth/auth-context';
import { SavePesoEnPieDto } from './dto/save-peso-en-pie.dto';

function dateOnly(s?: string) {
  const str = s ?? new Date().toISOString().slice(0, 10);
  return { str, date: new Date(`${str}T00:00:00.000Z`) };
}

@Injectable()
export class PesoEnPieService {
  constructor(private readonly prisma: PrismaService) {}

  private toDto(r: PesoEnPie) {
    return {
      id: r.id,
      reference: r.reference,
      date: r.date.toISOString().slice(0, 10),
      guia: r.guia,
      corral: r.corral,
      animalCount: r.animalCount,
      tipoPesaje: r.tipoPesaje,
      pesoTotalKg: r.pesoTotalKg == null ? null : Number(r.pesoTotalKg),
      pesoPromedioKg:
        r.pesoPromedioKg == null ? null : Number(r.pesoPromedioKg),
      observaciones: r.observaciones,
      status: r.status,
    };
  }

  /** Próxima referencia (orden de llegada) del día para la planta. */
  async nextReference(ctx: AuthContext, dateStr?: string) {
    const { date } = dateOnly(dateStr);
    const agg = await this.prisma.pesoEnPie.aggregate({
      _max: { reference: true },
      where: { plantId: ctx.plantId, date, deletedAt: null },
    });
    return { next: (agg._max.reference ?? 0) + 1 };
  }

  private fields(dto: SavePesoEnPieDto) {
    const tipoPesaje = dto.tipoPesaje ?? PesoEnPieTipoPesaje.promediado;
    const total = dto.pesoTotalKg ?? null;
    // Si no envían promedio pero sí total y cantidad, se calcula.
    let promedio = dto.pesoPromedioKg ?? null;
    if (promedio == null && total != null && dto.animalCount > 0) {
      promedio = Number((total / dto.animalCount).toFixed(2));
    }
    return {
      guia: dto.guia?.trim() || null,
      corral: dto.corral?.trim() || null,
      animalCount: dto.animalCount,
      tipoPesaje,
      pesoTotalKg: total,
      pesoPromedioKg: promedio,
      observaciones: dto.observaciones?.trim() || null,
    };
  }

  async create(ctx: AuthContext, dto: SavePesoEnPieDto) {
    const { str, date } = dateOnly(dto.date);
    return this.prisma.$transaction(async (tx) => {
      // Serializa la numeración de referencia por planta y día.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${ctx.plantId}:${str}:pep`}))`;
      const agg = await tx.pesoEnPie.aggregate({
        _max: { reference: true },
        where: { plantId: ctx.plantId, date, deletedAt: null },
      });
      const reference = (agg._max.reference ?? 0) + 1;
      const rec = await tx.pesoEnPie.create({
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

  async update(ctx: AuthContext, id: string, dto: SavePesoEnPieDto) {
    const existing = await this.prisma.pesoEnPie.findFirst({
      where: { id, plantId: ctx.plantId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Reporte no encontrado.');

    const rec = await this.prisma.pesoEnPie.update({
      where: { id },
      data: this.fields(dto),
    });
    return this.toDto(rec);
  }

  async findAll(ctx: AuthContext, status?: PesoEnPieStatus) {
    const rows = await this.prisma.pesoEnPie.findMany({
      where: {
        plantId: ctx.plantId,
        deletedAt: null,
        ...(status ? { status } : {}),
      },
      orderBy: [{ date: 'desc' }, { reference: 'desc' }],
      take: 200,
    });
    return rows.map((r) => this.toDto(r));
  }

  async findOne(ctx: AuthContext, id: string) {
    const rec = await this.prisma.pesoEnPie.findFirst({
      where: { id, plantId: ctx.plantId, deletedAt: null },
    });
    if (!rec) throw new NotFoundException('Reporte no encontrado.');
    return this.toDto(rec);
  }
}
