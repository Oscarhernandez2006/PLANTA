import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
      procedencia: r.procedencia,
      proveedor: r.proveedor,
      cliente: r.cliente,
      placa: r.placa,
      conductor: r.conductor,
      corral: r.corral,
      tipoAnimal: r.tipoAnimal,
      lote: r.lote,
      animalNo: r.animalNo,
      animalCount: r.animalCount,
      tipoPesaje: r.tipoPesaje,
      pesoTotalKg: r.pesoTotalKg == null ? null : Number(r.pesoTotalKg),
      pesoPromedioKg:
        r.pesoPromedioKg == null ? null : Number(r.pesoPromedioKg),
      cantidad: r.cantidad,
      entrada: r.entrada == null ? null : Number(r.entrada),
      salida: r.salida == null ? null : Number(r.salida),
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
      procedencia: dto.procedencia?.trim() || null,
      proveedor: dto.proveedor?.trim() || null,
      cliente: dto.cliente?.trim() || null,
      placa: dto.placa?.trim() || null,
      conductor: dto.conductor?.trim() || null,
      corral: dto.corral?.trim() || null,
      tipoAnimal: dto.tipoAnimal?.trim() || null,
      lote: dto.lote?.trim() || null,
      animalNo: dto.animalNo?.trim() || null,
      animalCount: dto.animalCount,
      tipoPesaje,
      pesoTotalKg: total,
      pesoPromedioKg: promedio,
      cantidad: dto.cantidad ?? null,
      entrada: dto.entrada ?? null,
      salida: dto.salida ?? null,
      observaciones: dto.observaciones?.trim() || null,
    };
  }

  async create(ctx: AuthContext, dto: SavePesoEnPieDto) {
    const { str, date } = dateOnly(dto.date);
    return this.prisma.$transaction(async (tx) => {
      if (dto.guia?.trim()) {
        const closedGuide = await tx.pesoEnPie.findFirst({
          where: {
            plantId: ctx.plantId,
            date,
            guia: dto.guia.trim(),
            status: PesoEnPieStatus.en_insensibilizacion,
            deletedAt: null,
          },
          select: { id: true },
        });
        if (closedGuide) {
          throw new BadRequestException('El proceso de esta guía ya está cerrado.');
        }
      }
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

  async closeGuide(ctx: AuthContext, dateStr: string, guia: string) {
    const { date } = dateOnly(dateStr);
    const normalizedGuia = guia.trim();
    if (!normalizedGuia) throw new NotFoundException('Guía no encontrada.');

    const result = await this.prisma.pesoEnPie.updateMany({
      where: {
        plantId: ctx.plantId,
        date,
        guia: normalizedGuia,
        deletedAt: null,
        status: PesoEnPieStatus.pendiente,
      },
      data: { status: PesoEnPieStatus.en_insensibilizacion },
    });

    if (!result.count) {
      throw new NotFoundException('No hay animales pendientes para cerrar.');
    }

    return { closed: result.count };
  }

  async findOne(ctx: AuthContext, id: string) {
    const rec = await this.prisma.pesoEnPie.findFirst({
      where: { id, plantId: ctx.plantId, deletedAt: null },
    });
    if (!rec) throw new NotFoundException('Reporte no encontrado.');
    return this.toDto(rec);
  }
}
