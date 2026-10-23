import { Injectable, NotFoundException } from '@nestjs/common';
import { HistoricoRetoma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthContext } from '../../common/auth/auth-context';
import { SaveHistoricoRetomaDto } from './dto/save-historico-retoma.dto';
import { nombreTarifa } from './historico-beneficio.sync';

const n = (v: { toString(): string } | null) => (v == null ? null : Number(v));
const fechaUTC = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00.000Z`);

/** Hoja RETOMAS del Histórico Sacrificio. */
@Injectable()
export class HistoricoRetomasService {
  constructor(private readonly prisma: PrismaService) {}

  private toDto(r: HistoricoRetoma) {
    return {
      id: r.id,
      fecha: r.fecha.toISOString().slice(0, 10),
      firmador: r.firmador,
      reses: r.reses,
      cabezas: r.cabezas,
      despojos: r.despojos,
      libros: r.libros,
      pielesKg: n(r.pielesKg),
      viscerasRojas: r.viscerasRojas,
      seboKg: n(r.seboKg),
      valorCabezas: Number(r.valorCabezas),
      valorDespojos: Number(r.valorDespojos),
      valorLibros: Number(r.valorLibros),
      valorPieles: Number(r.valorPieles),
      valorViscerasRojas: Number(r.valorViscerasRojas),
      valorSebo: Number(r.valorSebo),
    };
  }

  async listar(ctx: AuthContext, desde?: string, hasta?: string) {
    const rows = await this.prisma.historicoRetoma.findMany({
      where: {
        plantId: ctx.plantId,
        deletedAt: null,
        ...((desde || hasta) && {
          fecha: {
            ...(desde && { gte: fechaUTC(desde) }),
            ...(hasta && { lte: fechaUTC(hasta) }),
          },
        }),
      },
      orderBy: [{ fecha: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((r) => this.toDto(r));
  }

  /** Firmadores ya usados (para autocompletar). */
  async firmadores(ctx: AuthContext) {
    const rows = await this.prisma.historicoRetoma.findMany({
      where: { plantId: ctx.plantId, deletedAt: null, firmador: { not: null } },
      distinct: ['firmador'],
      select: { firmador: true },
      orderBy: { firmador: 'asc' },
    });
    return rows.map((r) => r.firmador as string);
  }

  async tarifas(ctx: AuthContext) {
    const rows = await this.prisma.historicoTarifaSubproducto.findMany({
      where: { plantId: ctx.plantId },
      orderBy: { cliente: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      cliente: r.cliente,
      cabezas: Number(r.cabezas),
      despojos: Number(r.despojos),
      libros: Number(r.libros),
      pieles: Number(r.pieles),
      sebo: Number(r.sebo),
      viscerasRojas: Number(r.viscerasRojas),
    }));
  }

  /** Valores unitarios del firmador (como los BUSCARX de la hoja: 0 si no está). */
  private async valoresDe(ctx: AuthContext, firmador: string) {
    const nombre = nombreTarifa(firmador);
    const t = (await this.tarifas(ctx)).find((x) => nombreTarifa(x.cliente) === nombre);
    return {
      valorCabezas: t?.cabezas ?? 0,
      valorDespojos: t?.despojos ?? 0,
      valorLibros: t?.libros ?? 0,
      valorPieles: t?.pieles ?? 0,
      valorViscerasRojas: t?.viscerasRojas ?? 0,
      valorSebo: t?.sebo ?? 0,
    };
  }

  private async fields(ctx: AuthContext, dto: SaveHistoricoRetomaDto) {
    const tarifa = await this.valoresDe(ctx, dto.firmador);
    return {
      fecha: fechaUTC(dto.fecha),
      firmador: dto.firmador.trim(),
      reses: dto.reses ?? 0,
      cabezas: dto.cabezas ?? null,
      despojos: dto.despojos ?? null,
      libros: dto.libros ?? null,
      pielesKg: dto.pielesKg ?? null,
      viscerasRojas: dto.viscerasRojas ?? null,
      seboKg: dto.seboKg ?? null,
      valorCabezas: dto.valorCabezas ?? tarifa.valorCabezas,
      valorDespojos: dto.valorDespojos ?? tarifa.valorDespojos,
      valorLibros: dto.valorLibros ?? tarifa.valorLibros,
      valorPieles: dto.valorPieles ?? tarifa.valorPieles,
      valorViscerasRojas: dto.valorViscerasRojas ?? tarifa.valorViscerasRojas,
      valorSebo: dto.valorSebo ?? tarifa.valorSebo,
    };
  }

  async crear(ctx: AuthContext, dto: SaveHistoricoRetomaDto) {
    const rec = await this.prisma.historicoRetoma.create({
      data: { plantId: ctx.plantId, createdById: ctx.userId, ...(await this.fields(ctx, dto)) },
    });
    return this.toDto(rec);
  }

  private async existente(ctx: AuthContext, id: string) {
    const rec = await this.prisma.historicoRetoma.findFirst({
      where: { id, plantId: ctx.plantId, deletedAt: null },
    });
    if (!rec) throw new NotFoundException('Registro no encontrado.');
    return rec;
  }

  async actualizar(ctx: AuthContext, id: string, dto: SaveHistoricoRetomaDto) {
    await this.existente(ctx, id);
    const rec = await this.prisma.historicoRetoma.update({
      where: { id },
      data: await this.fields(ctx, dto),
    });
    return this.toDto(rec);
  }

  async borrar(ctx: AuthContext, id: string) {
    await this.existente(ctx, id);
    await this.prisma.historicoRetoma.update({ where: { id }, data: { deletedAt: new Date() } });
    return { id };
  }
}
