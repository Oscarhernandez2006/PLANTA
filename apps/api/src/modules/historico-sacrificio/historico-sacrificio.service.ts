import { Injectable, NotFoundException } from '@nestjs/common';
import { HistoricoBeneficio } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthContext } from '../../common/auth/auth-context';
import { SaveHistoricoBeneficioDto } from './dto/save-historico-beneficio.dto';
import { HistoricoBeneficioSync } from './historico-beneficio.sync';

const n = (v: { toString(): string } | null) => (v == null ? null : Number(v));
const fechaUTC = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00.000Z`);

@Injectable()
export class HistoricoSacrificioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sync: HistoricoBeneficioSync,
  ) {}

  private toDto(r: HistoricoBeneficio) {
    return {
      id: r.id,
      ordenBeneficioId: r.ordenBeneficioId,
      fecha: r.fecha.toISOString().slice(0, 10),
      proveedor: r.proveedor,
      firmador: r.firmador,
      cliente: r.cliente,
      granja: r.granja,
      municipio: r.municipio,
      guiaIca: r.guiaIca,
      lote: r.lote,
      novillo: r.novillo,
      novilla: r.novilla,
      vaca: r.vaca,
      toro: r.toro,
      bufalo: r.bufalo,
      pieles: r.pieles,
      pesoPieKg: n(r.pesoPieKg),
      pesoCalienteKg: n(r.pesoCalienteKg),
      tarifa: n(r.tarifa),
    };
  }

  async beneficio(ctx: AuthContext, desde?: string, hasta?: string) {
    const rows = await this.prisma.historicoBeneficio.findMany({
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
      orderBy: [{ fecha: 'asc' }, { lote: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((r) => this.toDto(r));
  }

  /** Valores ya usados en cada columna de texto (para autocompletar). */
  async opciones(ctx: AuthContext) {
    const campos = ['proveedor', 'firmador', 'cliente', 'granja', 'municipio'] as const;
    const out: Record<string, string[]> = {};
    for (const campo of campos) {
      const rows = await this.prisma.historicoBeneficio.findMany({
        where: { plantId: ctx.plantId, deletedAt: null, [campo]: { not: null } },
        distinct: [campo],
        select: { [campo]: true },
        orderBy: { [campo]: 'asc' },
      });
      out[campo] = rows.map((r) => (r as Record<string, string>)[campo]);
    }
    const lote = await this.prisma.historicoBeneficio.aggregate({
      _max: { lote: true },
      where: { plantId: ctx.plantId, deletedAt: null },
    });
    return { ...out, siguienteLote: (lote._max.lote ?? 0) + 1 };
  }

  async tarifas(ctx: AuthContext) {
    const rows = await this.prisma.historicoTarifa.findMany({
      where: { plantId: ctx.plantId },
      orderBy: { cliente: 'asc' },
    });
    return rows.map((r) => ({ id: r.id, cliente: r.cliente, valorBase: Number(r.valorBase) }));
  }

  /** Tarifa de sacrificio del firmador (como el BUSCARX de la hoja: 0 si no está). */
  private tarifaDe(ctx: AuthContext, firmador?: string | null) {
    return this.sync.tarifaDe(ctx.plantId, firmador);
  }

  /** Pasa al histórico las órdenes de beneficio ya terminadas en Canal Caliente. */
  sincronizar(ctx: AuthContext) {
    return this.sync.sincronizarTodas(ctx.plantId);
  }

  private async fields(ctx: AuthContext, dto: SaveHistoricoBeneficioDto) {
    const t = (s?: string) => s?.trim() || null;
    return {
      fecha: fechaUTC(dto.fecha),
      proveedor: t(dto.proveedor),
      firmador: t(dto.firmador),
      cliente: t(dto.cliente),
      granja: t(dto.granja),
      municipio: t(dto.municipio),
      guiaIca: t(dto.guiaIca),
      lote: dto.lote ?? null,
      novillo: dto.novillo ?? 0,
      novilla: dto.novilla ?? 0,
      vaca: dto.vaca ?? 0,
      toro: dto.toro ?? 0,
      bufalo: dto.bufalo ?? 0,
      pieles: dto.pieles ?? null,
      pesoPieKg: dto.pesoPieKg ?? null,
      pesoCalienteKg: dto.pesoCalienteKg ?? null,
      tarifa: await this.tarifaDe(ctx, dto.firmador),
    };
  }

  async crear(ctx: AuthContext, dto: SaveHistoricoBeneficioDto) {
    const rec = await this.prisma.historicoBeneficio.create({
      data: { plantId: ctx.plantId, createdById: ctx.userId, ...(await this.fields(ctx, dto)) },
    });
    return this.toDto(rec);
  }

  private async existente(ctx: AuthContext, id: string) {
    const rec = await this.prisma.historicoBeneficio.findFirst({
      where: { id, plantId: ctx.plantId, deletedAt: null },
    });
    if (!rec) throw new NotFoundException('Registro no encontrado.');
    return rec;
  }

  async actualizar(ctx: AuthContext, id: string, dto: SaveHistoricoBeneficioDto) {
    await this.existente(ctx, id);
    const rec = await this.prisma.historicoBeneficio.update({
      where: { id },
      data: await this.fields(ctx, dto),
    });
    return this.toDto(rec);
  }

  async borrar(ctx: AuthContext, id: string) {
    await this.existente(ctx, id);
    await this.prisma.historicoBeneficio.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { id };
  }
}
