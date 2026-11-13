import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthContext } from '../../common/auth/auth-context';
import { plantDateOnly, plantToday } from '../../common/plant-date';
import { agruparCanales } from '../../common/canales-traslado';
import { MaestrosService } from './maestros.service';
import { FinanzasService } from './finanzas.service';

/**
 * Retomas por nombre normalizado, como en los talleres. Solo se usan mientras no
 * haya reglas por corte configuradas.
 */
export const RETOMAS = [
  'CHOCOZUELA',
  'DECOMISO',
  'GRASA DE PECHO',
  'HUESO BLANCO',
  'HUESO ECONOMICO CONG',
  'HUESO NEGRO CONGELADO',
  'OMBLIGO',
  'SEBO',
];

export const normalizar = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
const esRetoma = (nombre: string) => RETOMAS.includes(normalizar(nombre));
const r2 = (n: number) => Math.round(n * 100) / 100;
const dia = (d: Date) => d.toISOString().slice(0, 10);

interface ProductoKg {
  codigo: string;
  nombre: string;
  kg: number;
  unds: number;
}

function acumular(map: Map<string, ProductoKg>, codigo: string, nombre: string, kg: number, unds: number) {
  const p = map.get(codigo) ?? { codigo, nombre, kg: 0, unds: 0 };
  p.kg += kg;
  p.unds += unds;
  map.set(codigo, p);
}

const listar = (map: Map<string, ProductoKg>) =>
  [...map.values()]
    .map((p) => ({ ...p, kg: r2(p.kg) }))
    .sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }));

/** Rango de fechas de proceso: por defecto, el mes en curso. */
function rango(desde?: string, hasta?: string) {
  const hoy = plantToday();
  return {
    gte: plantDateOnly(desde ?? `${hoy.slice(0, 7)}-01`),
    lte: plantDateOnly(hasta ?? hoy),
  };
}

@Injectable()
export class TalleresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly maestros: MaestrosService,
    private readonly finanzas: FinanzasService,
  ) {}

  /**
   * Taller de desposte: cada orden de producción es un lote. Materia prima =
   * canales del traslado a sala (peso frío; caliente si no se pesó en frío);
   * producción = etiquetas vigentes de Rotulado Desposte.
   */
  async desposte(ctx: AuthContext, desde?: string, hasta?: string) {
    const ops = await this.prisma.productionOrder.findMany({
      where: { plantId: ctx.plantId, deletedAt: null, processDate: rango(desde, hasta) },
      orderBy: [{ processDate: 'asc' }, { opNumber: 'asc' }],
      select: {
        id: true,
        opNumber: true,
        processDate: true,
        status: true,
        cliente: { select: { id: true, concepto: true } },
        dispatchOrder: {
          select: {
            odNumber: true,
            items: {
              select: {
                pesoCalienteKg: true,
                despachoKg: true,
                canalPieza: {
                  select: {
                    pieza: true,
                    eventoId: true,
                    evento: {
                      select: { canalAnimalTipo: true, ordenBeneficio: { select: { date: true } } },
                    },
                  },
                },
              },
            },
          },
        },
        etiquetas: {
          where: { deletedAt: null },
          select: {
            netoKg: true,
            canastillaId: true,
            productId: true,
            product: { select: { codigo: true, nombre: true } },
          },
        },
      },
    });

    // Retomas según las reglas por corte de cada cliente; sin reglas, por nombre.
    const hayReglas = (await this.prisma.reglaCorte.count({ where: { plantId: ctx.plantId, retoma: true } })) > 0;
    const retomasPorCliente = new Map<string, Set<string>>();
    if (hayReglas) {
      for (const id of new Set(ops.map((o) => o.cliente.id))) {
        retomasPorCliente.set(id, await this.maestros.productosRetoma(ctx.plantId, id));
      }
    }
    const finanzas = await this.finanzas.desposte(ctx, ops.map((o) => o.id));

    return ops.map((op) => {
      const items = op.dispatchOrder.items;
      const g = agruparCanales(
        items.map((i) => ({
          pieza: i.canalPieza.pieza,
          eventoId: i.canalPieza.eventoId,
          kg: Number(i.despachoKg ?? i.pesoCalienteKg),
        })),
      );
      // Una media canal sin su pareja equivale a media res.
      const canales = g.completas.canales + g.pares.canales + (g.sueltasIzq.canales + g.sueltasDer.canales) / 2;
      const kgCaliente = items.reduce((s, i) => s + Number(i.pesoCalienteKg), 0);
      const kgFrio = items.reduce((s, i) => s + Number(i.despachoKg ?? i.pesoCalienteKg), 0);
      const sinFrio = items.filter((i) => i.despachoKg == null).length;

      const animales = new Map<string, string | null>();
      for (const i of items) animales.set(i.canalPieza.eventoId, i.canalPieza.evento.canalAnimalTipo);
      const tipos: Record<string, number> = {};
      for (const t of animales.values()) tipos[t ?? 'sin_clasificar'] = (tipos[t ?? 'sin_clasificar'] ?? 0) + 1;

      const productos = new Map<string, ProductoKg>();
      const canastillas = new Set<string>();
      let kgProducido = 0;
      let kgRetoma = 0;
      const retomas = retomasPorCliente.get(op.cliente.id);
      for (const e of op.etiquetas) {
        const kg = Number(e.netoKg);
        kgProducido += kg;
        if (hayReglas ? retomas?.has(e.productId) : esRetoma(e.product.nombre)) kgRetoma += kg;
        if (e.canastillaId) canastillas.add(e.canastillaId);
        acumular(productos, e.product.codigo, e.product.nombre, kg, 1);
      }
      const sacrificios = items.map((i) => dia(i.canalPieza.evento.ordenBeneficio.date)).sort();

      return {
        id: op.id,
        opNumber: op.opNumber,
        odNumber: op.dispatchOrder.odNumber,
        fecha: dia(op.processDate),
        fechaSacrificio: sacrificios[0] ?? null,
        clienteId: op.cliente.id,
        cliente: op.cliente.concepto,
        status: op.status,
        canales,
        animales: tipos,
        kgCaliente: r2(kgCaliente),
        kgFrio: r2(kgFrio),
        canalesSinFrio: sinFrio,
        kgProducido: r2(kgProducido),
        kgRetoma: r2(kgRetoma),
        etiquetas: op.etiquetas.length,
        canastillas: canastillas.size,
        productos: listar(productos),
        finanzas: finanzas.get(op.id) ?? null,
      };
    });
  }

  /**
   * Taller de acondicionamiento: un proceso por orden de traslado (la entrada
   * es lo trasladado; varias OC sobre la misma OT comparten esa entrada).
   */
  async acondicionamiento(ctx: AuthContext, desde?: string, hasta?: string, margenObjetivo?: number) {
    const ocs = await this.prisma.conditioningOrder.findMany({
      where: { plantId: ctx.plantId, deletedAt: null, processDate: rango(desde, hasta) },
      orderBy: [{ processDate: 'asc' }, { ocNumber: 'asc' }],
      select: {
        id: true,
        ocNumber: true,
        processDate: true,
        proceso: true,
        status: true,
        transferOrderId: true,
        cliente: { select: { id: true, concepto: true } },
        etiquetas: {
          where: { deletedAt: null },
          select: { netoKg: true, product: { select: { codigo: true, nombre: true } } },
        },
      },
    });
    const otIds = [...new Set(ocs.map((o) => o.transferOrderId))];
    const ots = otIds.length
      ? await this.prisma.transferOrder.findMany({
          where: { id: { in: otIds } },
          select: {
            id: true,
            otNumber: true,
            processDate: true,
            items: {
              select: {
                netoKg: true,
                unds: true,
                product: { select: { codigo: true, nombre: true } },
                etiqueta: { select: { productionOrder: { select: { opNumber: true } } } },
                canastilla: { select: { productionOrder: { select: { opNumber: true } } } },
              },
            },
          },
        })
      : [];
    const otPorId = new Map(ots.map((o) => [o.id, o]));

    const grupos = new Map<string, typeof ocs>();
    for (const oc of ocs) grupos.set(oc.transferOrderId, [...(grupos.get(oc.transferOrderId) ?? []), oc]);
    const finanzas = await this.finanzas.acondicionamiento(ctx, [...grupos.keys()], (margenObjetivo ?? 10) / 100);

    return [...grupos].map(([otId, lista]) => {
      const ot = otPorId.get(otId)!;
      const entradas = new Map<string, ProductoKg>();
      const lotesOrigen = new Set<number>();
      for (const i of ot.items) {
        acumular(entradas, i.product.codigo, i.product.nombre, Number(i.netoKg), i.unds);
        const op = i.etiqueta?.productionOrder.opNumber ?? i.canastilla?.productionOrder.opNumber;
        if (op != null) lotesOrigen.add(op);
      }
      const salidas = new Map<string, ProductoKg>();
      for (const oc of lista) {
        for (const e of oc.etiquetas) acumular(salidas, e.product.codigo, e.product.nombre, Number(e.netoKg), 1);
      }
      const entradaKg = [...entradas.values()].reduce((s, p) => s + p.kg, 0);
      const salidaKg = [...salidas.values()].reduce((s, p) => s + p.kg, 0);
      return {
        otId,
        otNumber: ot.otNumber,
        ocNumbers: lista.map((o) => o.ocNumber),
        fecha: dia(lista[0].processDate),
        clienteId: lista[0].cliente.id,
        cliente: lista[0].cliente.concepto,
        procesos: [...new Set(lista.map((o) => o.proceso))],
        activo: lista.some((o) => o.status === 'activo'),
        lotesOrigen: [...lotesOrigen].sort((a, b) => a - b),
        entradaKg: r2(entradaKg),
        salidaKg: r2(salidaKg),
        etiquetas: lista.reduce((s, o) => s + o.etiquetas.length, 0),
        entradas: listar(entradas),
        salidas: listar(salidas),
        finanzas: finanzas.get(otId) ?? null,
      };
    });
  }
}
