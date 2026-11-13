import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthContext } from '../../common/auth/auth-context';
import { MaestrosService, totalCosto } from './maestros.service';

const dia = (d: Date) => d.toISOString().slice(0, 10);
const r2 = (v: number) => Math.round(v * 100) / 100;

export interface LineaGasto {
  concepto: string;
  categoria: string;
  base: string;
  cantidad: number;
  valorUnitario: number;
  total: number;
  manual: boolean;
}

export interface CorteFinanzas {
  codigo: string;
  precioKg: number;
  venta: number;
  participacionVenta: number | null;
  costoAsignado: number | null;
  costoKg: number | null;
}

interface Cantidades {
  kgFrio: number;
  canales: number;
  kgEntrada: number;
  kgEmpacado: number;
  kgPiking: number;
  kgCongelado: number;
  procesos: string[];
}

type Tarifas = Awaited<ReturnType<MaestrosService['tarifas']>>;

/** Cantidad calculada de un concepto según su base (las unidades se digitan). */
function cantidadAuto(t: Tarifas[number], c: Cantidades) {
  const concepto = t.concepto.toUpperCase();
  if (t.categoria === 'inyeccion') return c.procesos.includes('inyectado') ? c.kgEntrada : 0;
  if (t.categoria === 'porcionado') return c.procesos.includes('porcionado') && concepto === 'PORCIONADO' ? c.kgEntrada : 0;
  switch (t.base) {
    case 'kg_frio':
      return c.kgFrio;
    case 'canal':
      return c.canales;
    case 'kg_entrada':
      return c.kgEntrada;
    case 'kg_empacado':
      return c.kgEmpacado;
    case 'kg':
      if (concepto.includes('PIKING') || concepto.includes('PICKING')) return c.kgPiking;
      if (concepto.includes('CONGELA')) return c.kgCongelado;
      return 0;
    default:
      return 0;
  }
}

function gastos(tarifas: Tarifas, c: Cantidades, manuales: { concepto: string; cantidad: number; valorUnitario: number | null }[]) {
  const manual = new Map(manuales.map((m) => [m.concepto, m]));
  const lineas: LineaGasto[] = [];
  for (const t of tarifas) {
    if (!t.activo) continue;
    const m = manual.get(t.concepto);
    const cantidad = m ? m.cantidad : cantidadAuto(t, c);
    if (!cantidad) continue;
    const valorUnitario = m?.valorUnitario ?? t.valor;
    lineas.push({ concepto: t.concepto, categoria: t.categoria, base: t.base, cantidad: r2(cantidad), valorUnitario, total: r2(cantidad * valorUnitario), manual: !!m });
    manual.delete(t.concepto);
  }
  // Conceptos digitados sin tarifa vigente: se cobran con el valor que se escribió.
  for (const m of manual.values()) {
    if (!m.cantidad || m.valorUnitario == null) continue;
    lineas.push({ concepto: m.concepto, categoria: 'servicio', base: 'unidad', cantidad: m.cantidad, valorUnitario: m.valorUnitario, total: r2(m.cantidad * m.valorUnitario), manual: true });
  }
  return lineas;
}

/**
 * Reparte un costo entre cortes según su participación en la venta. Si a algún corte
 * le falta precio, el reparto por venta se distorsiona: entonces se reparte por kg.
 */
function repartir(cortes: { codigo: string; kg: number; precioKg: number }[], costoBase: number | null) {
  const venta = cortes.reduce((s, c) => s + c.kg * c.precioKg, 0);
  const kg = cortes.reduce((s, c) => s + c.kg, 0);
  const porVenta = venta > 0 && cortes.every((c) => c.kg <= 0 || c.precioKg > 0);
  return cortes.map<CorteFinanzas>((c) => {
    const v = c.kg * c.precioKg;
    const part = porVenta ? v / venta : kg > 0 ? c.kg / kg : null;
    const asignado = costoBase != null && part != null ? costoBase * part : null;
    return {
      codigo: c.codigo,
      precioKg: c.precioKg,
      venta: r2(v),
      participacionVenta: venta > 0 ? r2((v * 100) / venta) : null,
      costoAsignado: asignado == null ? null : r2(asignado),
      costoKg: asignado != null && c.kg > 0 ? r2(asignado / c.kg) : null,
    };
  });
}

/**
 * Valoración económica de los talleres: venta con la lista de precios vigente,
 * costo del ganado repartido hasta cada canal, gastos de proceso con las tarifas
 * vigentes, utilidad y costo por kg de cada corte o producto.
 */
@Injectable()
export class FinanzasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly maestros: MaestrosService,
  ) {}

  private tarifasCache = new Map<string, Promise<Tarifas>>();
  private tarifasDe(ctx: AuthContext, clienteId: string, fecha: string) {
    const clave = `${ctx.plantId}|${clienteId}|${fecha}`;
    if (!this.tarifasCache.has(clave)) {
      this.tarifasCache.set(clave, this.maestros.tarifas(ctx, clienteId, fecha));
      setTimeout(() => this.tarifasCache.delete(clave), 5_000);
    }
    return this.tarifasCache.get(clave)!;
  }

  /** Costo de ganado de cada pieza de canal (por id), repartido animal por animal. */
  private async costoPiezas(eventoIds: string[]) {
    const eventos = await this.prisma.ordenBeneficioEvento.findMany({
      where: { id: { in: eventoIds } },
      select: { ordenBeneficioId: true },
    });
    const obIds = [...new Set(eventos.map((e) => e.ordenBeneficioId))];
    const obs = await this.prisma.ordenBeneficio.findMany({
      where: { id: { in: obIds } },
      select: {
        id: true,
        animalCount: true,
        costoGanado: true,
        animales: { select: { ordenSequence: true, pesoTotalKg: true } },
        eventos: { select: { id: true, sequence: true, canalPiezas: { select: { id: true, pesoKg: true } } } },
      },
    });
    const costo = new Map<string, number>();
    for (const ob of obs) {
      const c = ob.costoGanado;
      if (!c) continue;
      const pie = new Map(ob.animales.map((a) => [a.ordenSequence, Number(a.pesoTotalKg ?? 0)]));
      const canalKg = (e: (typeof ob.eventos)[number]) => e.canalPiezas.reduce((s, p) => s + Number(p.pesoKg), 0);
      const total = totalCosto(c.metodo, Number(c.valorUnitario), {
        pesoPieKg: [...pie.values()].reduce((s, v) => s + v, 0),
        pesoFincaKg: c.pesoFincaKg == null ? null : Number(c.pesoFincaKg),
        pesoCanalKg: ob.eventos.reduce((s, e) => s + canalKg(e), 0),
        animales: ob.animalCount,
      });
      if (total == null) continue;
      // Peso de reparto: canal si se liquidó por canal, peso en pie si no; por animal, partes iguales.
      const peso = (e: (typeof ob.eventos)[number]) =>
        c.metodo === 'por_animal' ? 1 : c.metodo === 'kg_canal' ? canalKg(e) : (pie.get(e.sequence) ?? 0) || canalKg(e);
      const suma = ob.eventos.reduce((s, e) => s + peso(e), 0);
      for (const e of ob.eventos) {
        const animal = suma > 0 ? (total * peso(e)) / suma : 0;
        const kgAnimal = canalKg(e);
        for (const p of e.canalPiezas) costo.set(p.id, kgAnimal > 0 ? (animal * Number(p.pesoKg)) / kgAnimal : 0);
      }
    }
    return costo;
  }

  /** Finanzas de cada orden de producción (lote de desposte). */
  async desposte(ctx: AuthContext, opIds: string[]) {
    if (!opIds.length) return new Map<string, ReturnType<FinanzasService['armarDesposte']>>();
    const ops = await this.prisma.productionOrder.findMany({
      where: { id: { in: opIds }, plantId: ctx.plantId },
      select: {
        id: true,
        processDate: true,
        clienteId: true,
        dispatchOrder: {
          select: {
            items: {
              select: {
                pesoCalienteKg: true,
                despachoKg: true,
                canalPieza: { select: { id: true, pieza: true, eventoId: true } },
              },
            },
          },
        },
        etiquetas: { where: { deletedAt: null }, select: { netoKg: true, empaque: true, productId: true, product: { select: { codigo: true } } } },
        serviciosManuales: { select: { concepto: true, cantidad: true, valorUnitario: true } },
      },
    });
    const costoPieza = await this.costoPiezas([...new Set(ops.flatMap((o) => o.dispatchOrder.items.map((i) => i.canalPieza.eventoId)))]);

    const out = new Map<string, ReturnType<FinanzasService['armarDesposte']>>();
    for (const op of ops) {
      const fecha = dia(op.processDate);
      const [precios, tarifas, reglas] = await Promise.all([
        this.maestros.preciosVigentes(ctx.plantId, op.clienteId, fecha),
        this.tarifasDe(ctx, op.clienteId, fecha),
        this.maestros.reglasEfectivas(ctx.plantId, op.clienteId),
      ]);
      out.set(op.id, this.armarDesposte(op, precios, tarifas, reglas, costoPieza));
    }
    return out;
  }

  private armarDesposte(
    op: {
      dispatchOrder: { items: { pesoCalienteKg: unknown; despachoKg: unknown; canalPieza: { id: string; pieza: string; eventoId: string } }[] };
      etiquetas: { netoKg: unknown; empaque: string; productId: string; product: { codigo: string } }[];
      serviciosManuales: { concepto: string; cantidad: unknown; valorUnitario: unknown }[];
    },
    precios: Map<string, number>,
    tarifas: Tarifas,
    reglas: Awaited<ReturnType<MaestrosService['reglasEfectivas']>>,
    costoPieza: Map<string, number>,
  ) {
    const items = op.dispatchOrder.items;
    const kgFrio = items.reduce((s, i) => s + Number(i.despachoKg ?? i.pesoCalienteKg), 0);
    const canales = items.reduce((s, i) => s + (i.canalPieza.pieza === 'canal' ? 1 : 0.5), 0);
    const sinCosto = items.filter((i) => !costoPieza.has(i.canalPieza.id)).length;
    const costoGanado = items.reduce((s, i) => s + (costoPieza.get(i.canalPieza.id) ?? 0), 0);

    const porCorte = new Map<string, { codigo: string; productId: string; kg: number }>();
    let kgEmpacado = 0;
    let kgPiking = 0;
    for (const e of op.etiquetas) {
      const kg = Number(e.netoKg);
      if (e.empaque.toUpperCase().includes('VACIO')) kgEmpacado += kg;
      if (reglas.get(e.productId)?.piking) kgPiking += kg;
      const c = porCorte.get(e.productId) ?? { codigo: e.product.codigo, productId: e.productId, kg: 0 };
      c.kg += kg;
      porCorte.set(e.productId, c);
    }
    let kgCongelado = 0;
    for (const c of porCorte.values()) {
      const r = reglas.get(c.productId);
      if (r?.congelacion) kgCongelado += r.kgCongelados == null ? c.kg : Math.min(r.kgCongelados, c.kg);
    }

    const lineas = gastos(
      tarifas,
      { kgFrio, canales, kgEntrada: 0, kgEmpacado, kgPiking, kgCongelado, procesos: [] },
      op.serviciosManuales.map((m) => ({ concepto: m.concepto, cantidad: Number(m.cantidad), valorUnitario: m.valorUnitario == null ? null : Number(m.valorUnitario) })),
    );
    const totalGastos = lineas.reduce((s, l) => s + l.total, 0);
    const cortes = [...porCorte.values()].map((c) => ({ codigo: c.codigo, kg: c.kg, precioKg: precios.get(c.productId) ?? 0 }));
    const venta = cortes.reduce((s, c) => s + c.kg * c.precioKg, 0);
    const sinPrecio = cortes.filter((c) => c.precioKg <= 0).length;
    const ganadoCompleto = items.length > 0 && sinCosto === 0;

    const pendientes: string[] = [];
    if (!items.length) pendientes.push('El lote no tiene canales trasladadas.');
    else if (sinCosto) pendientes.push(sinCosto === items.length ? 'Sin costo de ganado registrado.' : `${sinCosto} de ${items.length} piezas de canal sin costo de ganado.`);
    if (sinPrecio) pendientes.push(`${sinPrecio} corte(s) sin precio en la lista vigente.`);
    if (!lineas.some((l) => l.categoria === 'desposte')) pendientes.push('Sin tarifa de desposte vigente.');

    return {
      venta: r2(venta),
      costoGanado: r2(costoGanado),
      ganadoCompleto,
      gastos: lineas,
      totalGastos: r2(totalGastos),
      costoTotal: r2(costoGanado + totalGastos),
      utilidad: r2(venta - costoGanado - totalGastos),
      margen: venta > 0 ? r2(((venta - costoGanado - totalGastos) * 100) / venta) : null,
      cortes: repartir(cortes, ganadoCompleto ? costoGanado + totalGastos : null),
      pendientes,
    };
  }

  /**
   * Finanzas de cada proceso de acondicionamiento (por orden de traslado): materia prima
   * al costo por kg de su lote de desposte, venta de lo acondicionado y servicios.
   */
  async acondicionamiento(ctx: AuthContext, otIds: string[], margenObjetivo = 0.1) {
    const ots = await this.prisma.transferOrder.findMany({
      where: { id: { in: otIds }, plantId: ctx.plantId },
      select: {
        id: true,
        clienteId: true,
        items: {
          select: {
            netoKg: true,
            productId: true,
            product: { select: { codigo: true } },
            etiqueta: { select: { productionOrderId: true } },
            canastilla: { select: { productionOrderId: true } },
          },
        },
        conditioningOrders: {
          where: { deletedAt: null },
          select: {
            processDate: true,
            proceso: true,
            etiquetas: { where: { deletedAt: null }, select: { netoKg: true, empaque: true, productId: true, product: { select: { codigo: true } } } },
          },
        },
        serviciosManuales: { select: { concepto: true, cantidad: true, valorUnitario: true } },
      },
    });
    const opsOrigen = [...new Set(ots.flatMap((o) => o.items.map((i) => i.etiqueta?.productionOrderId ?? i.canastilla?.productionOrderId).filter((x): x is string => !!x)))];
    const desposte = await this.desposte(ctx, opsOrigen);

    const out = new Map<string, ReturnType<FinanzasService['armarAcond']>>();
    for (const ot of ots) {
      const ocs = ot.conditioningOrders;
      const fecha = ocs.length ? dia(ocs.map((o) => o.processDate).sort((a, b) => a.getTime() - b.getTime())[0]) : null;
      if (!fecha) continue;
      const [precios, tarifas, reglas] = await Promise.all([
        this.maestros.preciosVigentes(ctx.plantId, ot.clienteId, fecha),
        this.tarifasDe(ctx, ot.clienteId, fecha),
        this.maestros.reglasEfectivas(ctx.plantId, ot.clienteId),
      ]);
      out.set(ot.id, this.armarAcond(ot, ocs, desposte, precios, tarifas, reglas, margenObjetivo));
    }
    return out;
  }

  private armarAcond(
    ot: {
      items: { netoKg: unknown; productId: string; product: { codigo: string }; etiqueta: { productionOrderId: string } | null; canastilla: { productionOrderId: string } | null }[];
      serviciosManuales: { concepto: string; cantidad: unknown; valorUnitario: unknown }[];
    },
    ocs: { proceso: string; etiquetas: { netoKg: unknown; empaque: string; productId: string; product: { codigo: string } }[] }[],
    desposte: Map<string, ReturnType<FinanzasService['armarDesposte']>>,
    precios: Map<string, number>,
    tarifas: Tarifas,
    reglas: Awaited<ReturnType<MaestrosService['reglasEfectivas']>>,
    margenObjetivo: number,
  ) {
    // Materia prima: cada empaque trasladado al costo por kg de su corte en el lote de origen.
    let costoMP = 0;
    let kgSinCosto = 0;
    let kgEntrada = 0;
    const entradas = new Map<string, { codigo: string; kg: number; costo: number; sinCosto: number }>();
    for (const i of ot.items) {
      const kg = Number(i.netoKg);
      kgEntrada += kg;
      const opId = i.etiqueta?.productionOrderId ?? i.canastilla?.productionOrderId;
      const costoKg = opId ? desposte.get(opId)?.cortes.find((c) => c.codigo === i.product.codigo)?.costoKg ?? null : null;
      const e = entradas.get(i.product.codigo) ?? { codigo: i.product.codigo, kg: 0, costo: 0, sinCosto: 0 };
      e.kg += kg;
      if (costoKg == null) {
        kgSinCosto += kg;
        e.sinCosto += kg;
      } else {
        costoMP += kg * costoKg;
        e.costo += kg * costoKg;
      }
      entradas.set(i.product.codigo, e);
    }

    const porSalida = new Map<string, { codigo: string; productId: string; kg: number }>();
    let kgEmpacado = 0;
    let kgPiking = 0;
    for (const e of ocs.flatMap((o) => o.etiquetas)) {
      const kg = Number(e.netoKg);
      if (e.empaque.toUpperCase().includes('VACIO')) kgEmpacado += kg;
      if (reglas.get(e.productId)?.piking) kgPiking += kg;
      const s = porSalida.get(e.productId) ?? { codigo: e.product.codigo, productId: e.productId, kg: 0 };
      s.kg += kg;
      porSalida.set(e.productId, s);
    }
    let kgCongelado = 0;
    for (const s of porSalida.values()) {
      const r = reglas.get(s.productId);
      if (r?.congelacion) kgCongelado += r.kgCongelados == null ? s.kg : Math.min(r.kgCongelados, s.kg);
    }
    const kgSalida = [...porSalida.values()].reduce((t, s) => t + s.kg, 0);

    const lineas = gastos(
      tarifas.filter((t) => t.categoria !== 'desposte'),
      { kgFrio: 0, canales: 0, kgEntrada, kgEmpacado, kgPiking, kgCongelado, procesos: ocs.map((o) => o.proceso) },
      ot.serviciosManuales.map((m) => ({ concepto: m.concepto, cantidad: Number(m.cantidad), valorUnitario: m.valorUnitario == null ? null : Number(m.valorUnitario) })),
    );
    const totalGastos = lineas.reduce((s, l) => s + l.total, 0);
    const salidas = [...porSalida.values()].map((s) => ({ codigo: s.codigo, kg: s.kg, precioKg: precios.get(s.productId) ?? 0 }));
    const venta = salidas.reduce((s, c) => s + c.kg * c.precioKg, 0);
    const mpCompleta = kgEntrada > 0 && kgSinCosto === 0;
    // Por salida: costo de materia prima repartido por venta + gasto por kg de salida, y precio sugerido.
    const gastoKg = kgSalida > 0 ? totalGastos / kgSalida : 0;
    const cortes = repartir(salidas, mpCompleta ? costoMP : null).map((c) => {
      const integral = c.costoKg == null ? null : c.costoKg + gastoKg;
      return {
        ...c,
        costoMpKg: c.costoKg,
        costoIntegralKg: integral == null ? null : r2(integral),
        precioSugeridoKg: integral == null ? null : r2(integral / (1 - margenObjetivo)),
      };
    });

    const pendientes: string[] = [];
    if (kgSinCosto) pendientes.push(`${r2(kgSinCosto)} kg de materia prima sin costo (su lote de desposte no está costeado).`);
    const sinPrecio = salidas.filter((s) => s.precioKg <= 0).length;
    if (sinPrecio) pendientes.push(`${sinPrecio} producto(s) sin precio en la lista vigente.`);

    return {
      venta: r2(venta),
      costoMP: r2(costoMP),
      mpCompleta,
      gastos: lineas,
      totalGastos: r2(totalGastos),
      costoTotal: r2(costoMP + totalGastos),
      utilidad: r2(venta - costoMP - totalGastos),
      margen: venta > 0 ? r2(((venta - costoMP - totalGastos) * 100) / venta) : null,
      margenObjetivo: margenObjetivo * 100,
      entradas: [...entradas.values()].map((e) => ({ codigo: e.codigo, costoKg: e.kg > e.sinCosto && e.kg ? r2(e.costo / (e.kg - e.sinCosto)) : null, costo: r2(e.costo) })),
      cortes,
      pendientes,
    };
  }
}
