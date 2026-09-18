import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthContext } from '../../common/auth/auth-context';
import { RegistrarSubproductoDto } from './dto/registrar-subproducto.dto';
import { plantDateOnly } from '../../common/plant-date';
import { SUBPRODUCTO_ITEMS, SUBPRODUCTO_ITEM_BY_TIPO } from './subproducto-items';
import { SubproductoDestino } from '@prisma/client';

function dateOnly(value?: string) {
  return plantDateOnly(value);
}

const TOTAL_ITEMS = SUBPRODUCTO_ITEMS.length;
// Posición de cada tipo en el catálogo, para listar el checklist en un orden fijo.
const ORDEN_TIPO = new Map(SUBPRODUCTO_ITEMS.map((i, idx) => [i.tipo, idx]));

@Injectable()
export class SubproductosService {
  constructor(private readonly prisma: PrismaService) {}

  private contarMarcados(subproductos: { marcado: boolean }[]) {
    return subproductos.filter((s) => s.marcado).length;
  }

  /**
   * Base del consecutivo global por día: para cada orden devuelve cuántos
   * animales acumulan las órdenes previas del mismo día (por referencia).
   */
  private async consecutivoBases(plantId: string, dates: Date[]) {
    const base = new Map<string, number>();
    if (!dates.length) return base;
    const all = await this.prisma.ordenBeneficio.findMany({
      where: { plantId, deletedAt: null, date: { in: dates } },
      orderBy: [{ date: 'asc' }, { reference: 'asc' }],
      select: { id: true, date: true, animalCount: true },
    });
    const running = new Map<string, number>();
    for (const o of all) {
      const key = o.date.toISOString().slice(0, 10);
      const acc = running.get(key) ?? 0;
      base.set(o.id, acc);
      running.set(key, acc + o.animalCount);
    }
    return base;
  }

  /** Lotes (órdenes) del día que ya tienen animales caídos. */
  async lotes(ctx: AuthContext, dateStr?: string) {
    const date = dateOnly(dateStr);
    const ordenes = await this.prisma.ordenBeneficio.findMany({
      where: {
        plantId: ctx.plantId,
        deletedAt: null,
        date,
        eventos: { some: {} },
      },
      orderBy: [{ reference: 'asc' }],
      include: {
        eventos: {
          select: { subproductos: { select: { marcado: true } } },
        },
      },
    });
    const bases = await this.consecutivoBases(ctx.plantId, [date]);
    return ordenes.map((o) => {
      let pesados = 0;
      for (const e of o.eventos) pesados += this.contarMarcados(e.subproductos);
      return {
        ordenBeneficioId: o.id,
        reference: o.reference,
        cliente: o.cliente,
        guias: o.guias,
        date: o.date.toISOString().slice(0, 10),
        consecutivoBase: bases.get(o.id) ?? 0,
        animalCount: o.animalCount,
        caidos: o.eventos.length,
        pesados,
        total: o.eventos.length * TOTAL_ITEMS,
        subproductoDestino: o.subproductoDestino,
        subproductoRetiroAt: o.subproductoRetiroAt?.toISOString() ?? null,
      };
    });
  }

  /** Detalle de un lote con sus animales caídos y su estado de pesaje. */
  async loteDetail(ctx: AuthContext, ordenBeneficioId: string) {
    const o = await this.prisma.ordenBeneficio.findFirst({
      where: { id: ordenBeneficioId, plantId: ctx.plantId, deletedAt: null },
      include: {
        eventos: {
          orderBy: { sequence: 'asc' },
          include: { subproductos: true },
        },
      },
    });
    if (!o) throw new NotFoundException('Lote no encontrado.');

    const bases = await this.consecutivoBases(ctx.plantId, [o.date]);
    const base = bases.get(o.id) ?? 0;

    const operatorIds = [
      ...new Set(
        o.eventos
          .flatMap((e) => e.subproductos.map((s) => s.operatorId))
          .filter((x): x is string => !!x),
      ),
    ];
    const users = operatorIds.length
      ? await this.prisma.appUser.findMany({
          where: { id: { in: operatorIds } },
          select: { id: true, fullName: true },
        })
      : [];
    const nameById = new Map(users.map((u) => [u.id, u.fullName]));

    let pesados = 0;
    // Resumen por producto: suma de todo lo registrado en el lote (mismo
    // cliente, mismo lote), para verificar que la información sea consistente.
    const resumenPorTipo = new Map<
      string,
      { marcados: number; totalKg: number }
    >();
    for (const e of o.eventos) {
      pesados += this.contarMarcados(e.subproductos);
      for (const s of e.subproductos) {
        if (!s.marcado) continue;
        const acc = resumenPorTipo.get(s.tipo) ?? { marcados: 0, totalKg: 0 };
        acc.marcados += 1;
        acc.totalKg += s.pesoKg != null ? Number(s.pesoKg) : 0;
        resumenPorTipo.set(s.tipo, acc);
      }
    }
    const resumen = SUBPRODUCTO_ITEMS.map((def) => {
      const acc = resumenPorTipo.get(def.tipo) ?? { marcados: 0, totalKg: 0 };
      return {
        tipo: def.tipo,
        codigo: def.codigo,
        label: def.label,
        unidad: def.unidad,
        categoria: def.categoria,
        marcados: acc.marcados,
        esperados: o.eventos.length,
        totalKg: def.unidad === 'kg' ? acc.totalKg : null,
      };
    });

    return {
      ordenBeneficioId: o.id,
      reference: o.reference,
      cliente: o.cliente,
      guias: o.guias,
      date: o.date.toISOString().slice(0, 10),
      consecutivoBase: base,
      animalCount: o.animalCount,
      caidos: o.eventos.length,
      pesados,
      total: o.eventos.length * TOTAL_ITEMS,
      subproductoDestino: o.subproductoDestino,
      subproductoRetiroAt: o.subproductoRetiroAt?.toISOString() ?? null,
      subproductoRetiroObservaciones: o.subproductoRetiroObservaciones,
      resumen,
      animales: o.eventos.map((e) => ({
        eventoId: e.id,
        sequence: e.sequence,
        consecutivo: base + e.sequence,
        stunnedAt: e.stunnedAt.toISOString(),
        items: [...e.subproductos]
          .sort(
            (a, b) =>
              (ORDEN_TIPO.get(a.tipo) ?? 0) - (ORDEN_TIPO.get(b.tipo) ?? 0),
          )
          .map((s) => {
            const def = SUBPRODUCTO_ITEM_BY_TIPO.get(s.tipo);
            return {
              tipo: s.tipo,
              codigo: def?.codigo ?? '',
              label: def?.label ?? s.tipo,
              unidad: def?.unidad ?? 'unidad',
              categoria: def?.categoria ?? 'retoma',
              marcado: s.marcado,
              pesoKg: s.pesoKg != null ? Number(s.pesoKg) : null,
              registradoAt: s.registradoAt?.toISOString() ?? null,
              operatorName: s.operatorId
                ? (nameById.get(s.operatorId) ?? '—')
                : null,
            };
          }),
      })),
    };
  }

  /** Marca (o registra el peso de) un ítem del checklist de un animal caído. */
  async registrar(ctx: AuthContext, dto: RegistrarSubproductoDto) {
    const item = await this.prisma.subproductoItem.findFirst({
      where: {
        eventoId: dto.eventoId,
        tipo: dto.tipo,
        evento: { ordenBeneficio: { plantId: ctx.plantId, deletedAt: null } },
      },
    });
    if (!item) throw new NotFoundException('Ítem no encontrado.');
    if (item.marcado) {
      throw new BadRequestException('Este ítem ya fue registrado.');
    }

    const def = SUBPRODUCTO_ITEM_BY_TIPO.get(item.tipo);
    if (def?.unidad === 'kg' && dto.pesoKg == null) {
      throw new BadRequestException(`${def.label} requiere peso en kg.`);
    }

    await this.prisma.subproductoItem.update({
      where: { id: item.id },
      data: {
        marcado: true,
        pesoKg: def?.unidad === 'kg' ? dto.pesoKg : null,
        registradoAt: new Date(),
        operatorId: ctx.userId,
      },
    });
    return { ok: true };
  }

  /**
   * Asigna la cava de destino (Entrada) a todos los subproductos del lote.
   * Solo aplica a lotes cuyo destino es "empresa" (Entrada a cavas frío).
   */
  async asignarCava(ctx: AuthContext, ordenBeneficioId: string, cava: string) {
    const o = await this.prisma.ordenBeneficio.findFirst({
      where: { id: ordenBeneficioId, plantId: ctx.plantId, deletedAt: null },
    });
    if (!o) throw new NotFoundException('Lote no encontrado.');
    if (o.subproductoDestino !== SubproductoDestino.empresa) {
      throw new BadRequestException(
        'Este lote no tiene destino Entrada (cavas frío).',
      );
    }

    await this.prisma.subproductoItem.updateMany({
      where: { evento: { ordenBeneficioId } },
      data: { cava: cava.trim() },
    });
    return { ok: true };
  }
}

