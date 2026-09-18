import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthContext } from '../../common/auth/auth-context';
import { RegistrarSubproductoDto } from './dto/registrar-subproducto.dto';
import { plantDateOnly } from '../../common/plant-date';
import {
  SUBPRODUCTO_ITEMS,
  SUBPRODUCTO_ITEMS_CABEZA_PATAS,
  SUBPRODUCTO_ITEM_BY_TIPO,
} from './subproducto-items';
import { SubproductoDestino } from '@prisma/client';

function dateOnly(value?: string) {
  return plantDateOnly(value);
}

const TOTAL_ITEMS = SUBPRODUCTO_ITEMS.length;
const TOTAL_ITEMS_CABEZA_PATAS = SUBPRODUCTO_ITEMS_CABEZA_PATAS.length;
// Posición de cada tipo en el catálogo, para listar el checklist en un orden fijo.
const ORDEN_TIPO = new Map(
  [...SUBPRODUCTO_ITEMS, ...SUBPRODUCTO_ITEMS_CABEZA_PATAS].map((i, idx) => [
    i.tipo,
    idx,
  ]),
);

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

  /**
   * Lotes del día agrupados por cliente: si un cliente tiene varios lotes el
   * mismo día quedan amarrados en un solo grupo y sus subproductos se suman.
   */
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

    const porCliente = new Map<
      string,
      {
        cliente: string;
        ordenBeneficioIds: string[];
        references: number[];
        guias: Set<string>;
        animalCount: number;
        caidos: number;
        pesados: number;
        total: number;
        subproductoDestino: SubproductoDestino;
        subproductoRetiroAt: Date | null;
        cabezasPatas: boolean;
      }
    >();
    for (const o of ordenes) {
      let pesados = 0;
      for (const e of o.eventos) pesados += this.contarMarcados(e.subproductos);
      const total =
        o.eventos.length * TOTAL_ITEMS +
        (o.cabezasPatas ? o.eventos.length * TOTAL_ITEMS_CABEZA_PATAS : 0);

      const g = porCliente.get(o.cliente);
      if (!g) {
        porCliente.set(o.cliente, {
          cliente: o.cliente,
          ordenBeneficioIds: [o.id],
          references: [o.reference],
          guias: new Set(o.guias),
          animalCount: o.animalCount,
          caidos: o.eventos.length,
          pesados,
          total,
          subproductoDestino: o.subproductoDestino,
          subproductoRetiroAt: o.subproductoRetiroAt,
          cabezasPatas: o.cabezasPatas,
        });
      } else {
        g.ordenBeneficioIds.push(o.id);
        g.references.push(o.reference);
        for (const gu of o.guias) g.guias.add(gu);
        g.animalCount += o.animalCount;
        g.caidos += o.eventos.length;
        g.pesados += pesados;
        g.total += total;
        // Si algún lote del cliente aún no tiene retiro, el grupo queda pendiente.
        if (!o.subproductoRetiroAt) g.subproductoRetiroAt = null;
        g.cabezasPatas = g.cabezasPatas || o.cabezasPatas;
      }
    }

    return [...porCliente.values()]
      .sort((a, b) => a.references[0] - b.references[0])
      .map((g) => ({
        cliente: g.cliente,
        ordenBeneficioIds: g.ordenBeneficioIds,
        references: g.references,
        guias: [...g.guias],
        date: date.toISOString().slice(0, 10),
        animalCount: g.animalCount,
        caidos: g.caidos,
        pesados: g.pesados,
        total: g.total,
        subproductoDestino: g.subproductoDestino,
        subproductoRetiroAt: g.subproductoRetiroAt?.toISOString() ?? null,
        cabezasPatas: g.cabezasPatas,
      }));
  }

  /** Detalle combinado de todos los lotes de un cliente el mismo día. */
  async grupoDetail(ctx: AuthContext, cliente: string, dateStr?: string) {
    const date = dateOnly(dateStr);
    const ordenes = await this.prisma.ordenBeneficio.findMany({
      where: { plantId: ctx.plantId, deletedAt: null, date, cliente },
      orderBy: [{ reference: 'asc' }],
      include: {
        eventos: {
          orderBy: { sequence: 'asc' },
          include: { subproductos: true },
        },
      },
    });
    if (!ordenes.length) throw new NotFoundException('Lote no encontrado.');

    const bases = await this.consecutivoBases(ctx.plantId, [date]);

    const operatorIds = [
      ...new Set(
        ordenes
          .flatMap((o) => o.eventos)
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
    let caidos = 0;
    const cabezasPatas = ordenes.some((o) => o.cabezasPatas);
    // Resumen por producto: suma de todos los animales de todos los lotes de
    // este cliente el mismo día, para verificar que la información sea real.
    const resumenPorTipo = new Map<
      string,
      { marcados: number; totalKg: number }
    >();
    for (const o of ordenes) {
      caidos += o.eventos.length;
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
    }
    const resumen = [
      ...SUBPRODUCTO_ITEMS,
      ...(cabezasPatas ? SUBPRODUCTO_ITEMS_CABEZA_PATAS : []),
    ].map((def) => {
      const acc = resumenPorTipo.get(def.tipo) ?? { marcados: 0, totalKg: 0 };
      const multiplicador = def.multiplicador ?? 1;
      return {
        tipo: def.tipo,
        codigo: def.codigo,
        label: def.label,
        unidad: def.unidad,
        categoria: def.categoria,
        marcados: acc.marcados,
        esperados: caidos,
        totalKg: def.unidad === 'kg' ? acc.totalKg : null,
        cantidadTotal: def.unidad === 'unidad' ? acc.marcados * multiplicador : null,
      };
    });

    const total =
      caidos * TOTAL_ITEMS +
      (cabezasPatas
        ? ordenes.reduce(
            (acc, o) =>
              acc + (o.cabezasPatas ? o.eventos.length * TOTAL_ITEMS_CABEZA_PATAS : 0),
            0,
          )
        : 0);

    return {
      cliente,
      ordenBeneficioIds: ordenes.map((o) => o.id),
      references: ordenes.map((o) => o.reference),
      guias: [...new Set(ordenes.flatMap((o) => o.guias))],
      date: date.toISOString().slice(0, 10),
      animalCount: ordenes.reduce((acc, o) => acc + o.animalCount, 0),
      caidos,
      pesados,
      total,
      subproductoDestino: ordenes[0].subproductoDestino,
      subproductoRetiroAt: ordenes.every((o) => o.subproductoRetiroAt)
        ? (ordenes[0].subproductoRetiroAt?.toISOString() ?? null)
        : null,
      subproductoRetiroObservaciones: ordenes[0].subproductoRetiroObservaciones,
      cabezasPatas,
      resumen,
      animales: ordenes.flatMap((o) => {
        const base = bases.get(o.id) ?? 0;
        return o.eventos.map((e) => ({
          eventoId: e.id,
          reference: o.reference,
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
                cava: s.cava ?? null,
                registradoAt: s.registradoAt?.toISOString() ?? null,
                operatorName: s.operatorId
                  ? (nameById.get(s.operatorId) ?? '—')
                  : null,
              };
            }),
        }));
      }),
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

  /** Deshace (desmarca) un ítem ya registrado por error. */
  async deshacer(ctx: AuthContext, eventoId: string, tipo: string) {
    const item = await this.prisma.subproductoItem.findFirst({
      where: {
        eventoId,
        tipo,
        evento: { ordenBeneficio: { plantId: ctx.plantId, deletedAt: null } },
      },
    });
    if (!item) throw new NotFoundException('Ítem no encontrado.');
    if (!item.marcado) {
      throw new BadRequestException('Este ítem aún no está registrado.');
    }

    await this.prisma.subproductoItem.update({
      where: { id: item.id },
      data: {
        marcado: false,
        pesoKg: null,
        registradoAt: null,
        operatorId: null,
        cava: null,
      },
    });
    return { ok: true };
  }

  /**
   * Asigna la cava de destino (Entrada) a los subproductos de un grupo de
   * lotes (mismo cliente). Solo aplica a lotes con destino "empresa". Si se
   * indica categoría, solo mueve los subproductos de esa categoría.
   */
  async asignarCava(
    ctx: AuthContext,
    ordenBeneficioIds: string[],
    cava: string,
    categoria?: string,
  ) {
    const ordenes = await this.prisma.ordenBeneficio.findMany({
      where: {
        id: { in: ordenBeneficioIds },
        plantId: ctx.plantId,
        deletedAt: null,
      },
      select: { id: true, subproductoDestino: true },
    });
    if (!ordenes.length) throw new NotFoundException('Lote no encontrado.');
    if (ordenes.some((o) => o.subproductoDestino !== SubproductoDestino.empresa)) {
      throw new BadRequestException(
        'Este grupo no tiene destino Entrada (cavas frío).',
      );
    }

    const tipos = categoria
      ? [...SUBPRODUCTO_ITEMS, ...SUBPRODUCTO_ITEMS_CABEZA_PATAS]
          .filter((i) => i.categoria === categoria)
          .map((i) => i.tipo)
      : undefined;

    await this.prisma.subproductoItem.updateMany({
      where: {
        evento: { ordenBeneficioId: { in: ordenBeneficioIds } },
        ...(tipos && { tipo: { in: tipos } }),
      },
      data: { cava: cava.trim() },
    });
    return { ok: true };
  }
}

