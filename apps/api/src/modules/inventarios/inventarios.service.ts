import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DispatchOrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { parseCanalBarcode } from '../../common/canal-barcode';
import type { AuthContext } from '../../common/auth/auth-context';
import { plantDateOnly } from '../../common/plant-date';
import { SUBPRODUCTO_ITEM_BY_TIPO } from '../subproductos/subproducto-items';
import { peorSemaforo, semaforoCanal, semaforoVencimiento, type Semaforo } from './semaforo';

// Producto despachado en una orden DC cerrada: ya no está en inventario.
const despachoActivoONulo = {
  OR: [
    { despacho: { is: null } },
    { despacho: { canalDispatchOrder: { status: DispatchOrderStatus.activo } } },
  ],
};
const noDespachado = despachoActivoONulo;
const etiquetaNoDespachada = {
  AND: [
    despachoActivoONulo,
    { OR: [{ canastillaId: null }, { canastilla: despachoActivoONulo }] },
  ],
};
const dcSelect = { select: { canalDispatchOrder: { select: { dcNumber: true } } } } as const;

// Canales con este número de días o más en cava salen en alertas.
const DIAS_CANAL_ALERTA = 4;
// Productos que vencen dentro de estos días salen en alertas.
const DIAS_VENCE_ALERTA = 5;
const DIA_MS = 86_400_000;
const r2 = (n: number) => Math.round(n * 100) / 100;

// Lo recibido entra al inventario al cerrar el recibo, en la bodega del cliente elegida al cerrar.
const reciboEnInventario = { deletedAt: null, status: DispatchOrderStatus.facturado, bodegaId: { not: null } };
const reciboSelect = {
  select: {
    receiptNumber: true,
    processDate: true,
    cliente: { select: { concepto: true } },
    bodega: { select: { id: true, nombre: true } },
  },
} as const;
/** La cava del recibo de canales se guarda como número (1-5). */
const nombreCavaRecibo = (n: number) => `CAVA ${n}`;

@Injectable()
export class InventariosService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Tablero general: totales de planta, ocupación por cava, existencias por cliente y alertas
   * (canales con muchos días en cava, productos vencidos o por vencer, canales sin cava).
   */
  async resumen(ctx: AuthContext) {
    const ahora = Date.now();
    const hoy = plantDateOnly();
    const trasladoEstado = {
      select: {
        transferOrder: {
          select: { conditioningOrders: { where: { deletedAt: null, status: DispatchOrderStatus.facturado }, select: { id: true }, take: 1 } },
        },
      },
    } as const;
    const [canales, etiquetas, acond, subproductos, odAbiertas, dcAbiertas, recibidas, posta] = await Promise.all([
      this.prisma.canalPieza.findMany({
        where: this.canalEnInventario(ctx),
        select: {
          id: true,
          pieza: true,
          cava: true,
          pesoKg: true,
          weighedAt: true,
          evento: {
            select: {
              sequence: true,
              canalAnimalTipo: true,
              ordenBeneficio: { select: { reference: true, cliente: true } },
            },
          },
          despacho: { select: { cavaOrigen: true } },
          despachoCanal: { select: { cavaOrigen: true } },
        },
      }),
      this.prisma.rotuladoEtiqueta.findMany({
        where: { plantId: ctx.plantId, deletedAt: null, bodegaId: { not: null }, ...etiquetaNoDespachada },
        select: {
          netoKg: true,
          conservacion: true,
          fechaVencimiento: true,
          product: { select: { codigo: true, nombre: true } },
          bodega: { select: { id: true, nombre: true, cliente: { select: { concepto: true } } } },
          traslado: trasladoEstado,
          canastilla: { select: { traslado: trasladoEstado } },
        },
      }),
      this.prisma.acondicionamientoEtiqueta.findMany({
        where: { plantId: ctx.plantId, deletedAt: null, bodegaId: { not: null }, ...noDespachado },
        select: {
          netoKg: true,
          conservacion: true,
          fechaVencimiento: true,
          product: { select: { codigo: true, nombre: true } },
          bodega: { select: { id: true, nombre: true, cliente: { select: { concepto: true } } } },
        },
      }),
      this.prisma.subproductoItem.findMany({
        where: { cava: { not: null }, evento: { ordenBeneficio: { plantId: ctx.plantId, deletedAt: null } } },
        select: {
          tipo: true,
          cava: true,
          pesoKg: true,
          registradoAt: true,
          evento: { select: { ordenBeneficio: { select: { cliente: true } } } },
        },
      }),
      this.prisma.dispatchOrder.count({
        where: { plantId: ctx.plantId, deletedAt: null, status: DispatchOrderStatus.activo },
      }),
      this.prisma.canalDispatchOrder.count({
        where: { plantId: ctx.plantId, deletedAt: null, status: DispatchOrderStatus.activo },
      }),
      this.canalesRecibidas(ctx),
      this.productosPosta(ctx),
    ]);

    type Cava = {
      cava: string;
      tipo: 'canal' | 'subproducto';
      unds: number;
      kg: number;
      disponibles: number;
      enOrden: number;
      enDespacho: number;
      clientes: Set<string>;
      masAntiguaDias: number | null;
    };
    const cavas = new Map<string, Cava>();
    const cavaDe = (nombre: string, tipo: Cava['tipo']) => {
      let c = cavas.get(`${tipo}|${nombre}`);
      if (!c) {
        c = { cava: nombre, tipo, unds: 0, kg: 0, disponibles: 0, enOrden: 0, enDespacho: 0, clientes: new Set(), masAntiguaDias: null };
        cavas.set(`${tipo}|${nombre}`, c);
      }
      return c;
    };
    type Cliente = { cliente: string; canales: number; canalesKg: number; productos: number; productosKg: number; subproductos: number; subproductosKg: number; semaforo: Semaforo | null };
    const clientes = new Map<string, Cliente>();
    const clienteDe = (nombre: string) => {
      let c = clientes.get(nombre);
      if (!c) {
        c = { cliente: nombre, canales: 0, canalesKg: 0, productos: 0, productosKg: 0, subproductos: 0, subproductosKg: 0, semaforo: null };
        clientes.set(nombre, c);
      }
      return c;
    };

    const totCanales = { unds: 0, kg: 0, disponibles: 0, enOrden: 0, enDespacho: 0, sinCava: 0 };
    const canalesAntiguas: {
      piezaId: string;
      origen: 'beneficio' | 'recibo';
      cava: string;
      cliente: string;
      reference: number;
      sequence: number;
      pieza: string;
      canalAnimalTipo: string | null;
      pesoKg: number;
      dias: number;
    }[] = [];
    for (const p of canales) {
      const kg = Number(p.pesoKg);
      const cliente = p.evento.ordenBeneficio.cliente;
      const dias = Math.floor((ahora - p.weighedAt.getTime()) / DIA_MS);
      const ubicacion = p.cava ?? p.despacho?.cavaOrigen ?? p.despachoCanal?.cavaOrigen ?? null;
      totCanales.unds += 1;
      totCanales.kg += kg;
      const estado = p.despacho ? 'enOrden' : p.despachoCanal ? 'enDespacho' : 'disponibles';
      totCanales[estado] += 1;
      const cl = clienteDe(cliente);
      cl.canales += 1;
      cl.canalesKg += kg;
      cl.semaforo = peorSemaforo(cl.semaforo, semaforoCanal(p.weighedAt, ahora));
      if (!ubicacion) {
        totCanales.sinCava += 1;
        continue;
      }
      const c = cavaDe(ubicacion, 'canal');
      c.unds += 1;
      c.kg += kg;
      c[estado] += 1;
      c.clientes.add(cliente);
      c.masAntiguaDias = Math.max(c.masAntiguaDias ?? 0, dias);
      if (dias >= DIAS_CANAL_ALERTA && estado === 'disponibles') {
        canalesAntiguas.push({
          piezaId: p.id,
          origen: 'beneficio',
          cava: ubicacion,
          cliente,
          reference: p.evento.ordenBeneficio.reference,
          sequence: p.evento.sequence,
          pieza: p.pieza,
          canalAnimalTipo: p.evento.canalAnimalTipo,
          pesoKg: kg,
          dias,
        });
      }
    }

    for (const r of recibidas) {
      const f = this.reciboCanalFila(r);
      const dias = Math.floor((ahora - r.createdAt.getTime()) / DIA_MS);
      totCanales.unds += 1;
      totCanales.kg += f.pesoKg;
      totCanales[f.estado] += 1;
      const cl = clienteDe(f.cliente);
      cl.canales += 1;
      cl.canalesKg += f.pesoKg;
      cl.semaforo = peorSemaforo(cl.semaforo, semaforoCanal(r.createdAt, ahora));
      const c = cavaDe(f.cava, 'canal');
      c.unds += 1;
      c.kg += f.pesoKg;
      c[f.estado] += 1;
      c.clientes.add(f.cliente);
      c.masAntiguaDias = Math.max(c.masAntiguaDias ?? 0, dias);
      if (dias >= DIAS_CANAL_ALERTA && f.estado === 'disponibles') {
        canalesAntiguas.push({
          piezaId: r.id,
          origen: 'recibo',
          cava: f.cava,
          cliente: f.cliente,
          reference: f.reference,
          sequence: r.codigo,
          pieza: 'canal',
          canalAnimalTipo: null,
          pesoKg: f.pesoKg,
          dias,
        });
      }
    }

    const totProductos = { unds: 0, kg: 0, refrigeradoKg: 0, congeladoKg: 0, vencidos: 0 };
    const porVencer = new Map<
      string,
      { codigo: string; producto: string; cliente: string; bodegaId: string | null; bodega: string; vence: string; dias: number; unds: number; kg: number }
    >();
    const productosTodos = [
      ...etiquetas.map((e) => ({
        ...e,
        transformado: !!(e.traslado ?? e.canastilla?.traslado)?.transferOrder.conditioningOrders.length,
      })),
      ...acond.map((e) => ({ ...e, transformado: false })),
      ...posta.map((p) => ({
        netoKg: p.netoKg,
        conservacion: p.conservacion,
        fechaVencimiento: p.fechaVencimiento,
        product: p.product,
        bodega: { id: p.receiptOrder.bodega?.id ?? null, nombre: p.receiptOrder.bodega?.nombre ?? '', cliente: { concepto: p.receiptOrder.cliente.concepto } },
        transformado: false,
      })),
    ];
    for (const e of productosTodos) {
      const kg = Number(e.netoKg);
      totProductos.unds += 1;
      totProductos.kg += kg;
      if (/congel/i.test(e.conservacion ?? '')) totProductos.congeladoKg += kg;
      else totProductos.refrigeradoKg += kg;
      const cliente = e.bodega?.cliente.concepto ?? 'SIN CLIENTE';
      const cl = clienteDe(cliente);
      cl.productos += 1;
      cl.productosKg += kg;
      if (!e.transformado) cl.semaforo = peorSemaforo(cl.semaforo, semaforoVencimiento(e.fechaVencimiento, hoy));
      if (e.transformado) continue;
      if (!e.fechaVencimiento) continue;
      const dias = Math.round((e.fechaVencimiento.getTime() - hoy.getTime()) / DIA_MS);
      if (dias < 0) totProductos.vencidos += 1;
      if (dias > DIAS_VENCE_ALERTA) continue;
      const vence = e.fechaVencimiento.toISOString().slice(0, 10);
      const clave = JSON.stringify([e.product.codigo, e.bodega?.id, vence]);
      const g = porVencer.get(clave) ?? {
        codigo: e.product.codigo,
        producto: e.product.nombre,
        cliente,
        bodegaId: e.bodega?.id ?? null,
        bodega: e.bodega?.nombre ?? '',
        vence,
        dias,
        unds: 0,
        kg: 0,
      };
      g.unds += 1;
      g.kg += kg;
      porVencer.set(clave, g);
    }

    const totSub = { unds: 0, kg: 0 };
    for (const i of subproductos) {
      const def = SUBPRODUCTO_ITEM_BY_TIPO.get(i.tipo);
      const kg = i.pesoKg ? Number(i.pesoKg) : 0;
      const unds = def?.unidad === 'kg' ? 0 : (def?.multiplicador ?? 1);
      const cliente = i.evento.ordenBeneficio.cliente;
      totSub.unds += unds;
      totSub.kg += kg;
      const cl = clienteDe(cliente);
      cl.subproductos += unds;
      cl.subproductosKg += kg;
      const c = cavaDe(i.cava!, 'subproducto');
      c.unds += unds;
      c.kg += kg;
      c.disponibles += unds;
      c.clientes.add(cliente);
      if (i.registradoAt) {
        const dias = Math.floor((ahora - i.registradoAt.getTime()) / DIA_MS);
        c.masAntiguaDias = Math.max(c.masAntiguaDias ?? 0, dias);
      }
    }

    return {
      generadoAt: new Date(ahora).toISOString(),
      umbrales: { diasCanal: DIAS_CANAL_ALERTA, diasVence: DIAS_VENCE_ALERTA },
      canales: { ...totCanales, kg: r2(totCanales.kg) },
      productos: {
        ...totProductos,
        kg: r2(totProductos.kg),
        refrigeradoKg: r2(totProductos.refrigeradoKg),
        congeladoKg: r2(totProductos.congeladoKg),
      },
      subproductos: { unds: totSub.unds, kg: r2(totSub.kg) },
      ordenesAbiertas: { od: odAbiertas, dc: dcAbiertas },
      cavas: [...cavas.values()].map(({ clientes: cl, ...c }) => ({ ...c, kg: r2(c.kg), clientes: cl.size })),
      clientes: [...clientes.values()]
        .map((c) => ({
          ...c,
          canalesKg: r2(c.canalesKg),
          productosKg: r2(c.productosKg),
          subproductosKg: r2(c.subproductosKg),
        }))
        .sort((a, b) => b.canalesKg + b.productosKg + b.subproductosKg - (a.canalesKg + a.productosKg + a.subproductosKg)),
      alertas: {
        canalesAntiguas: canalesAntiguas.sort((a, b) => b.dias - a.dias).slice(0, 100),
        productosPorVencer: [...porVencer.values()]
          .map((g) => ({ ...g, kg: r2(g.kg) }))
          .sort((a, b) => a.dias - b.dias)
          .slice(0, 100),
      },
    };
  }

  // ---- Producto recibido de terceros (Recibo de Canales / Recibo en Posta) ----

  /**
   * Canales recibidas en inventario: su recibo se cerró (entraron a la bodega del cliente) y no
   * han salido, o están en una orden OD/DC activa. Con `incluirDespachadas`, también las que
   * salieron en órdenes ya cerradas.
   */
  private canalesRecibidas(
    ctx: AuthContext,
    where: Prisma.CanalReceiptItemWhereInput = {},
    incluirDespachadas = false,
  ) {
    return this.prisma.canalReceiptItem.findMany({
      where: {
        plantId: ctx.plantId,
        receiptOrder: reciboEnInventario,
        ...(incluirDespachadas
          ? {}
          : {
              OR: [
                { dispatchOrderId: null, canalDispatchOrderId: null },
                { dispatchOrder: { status: DispatchOrderStatus.activo, deletedAt: null } },
                { canalDispatchOrder: { status: DispatchOrderStatus.activo, deletedAt: null } },
              ],
            }),
        ...where,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        codigo: true,
        cava: true,
        pesoKg: true,
        guia: true,
        lote: true,
        identificacion: true,
        despachoKg: true,
        createdAt: true,
        receiptOrder: reciboSelect,
        dispatchOrder: { select: { odNumber: true, status: true, updatedAt: true } },
        canalDispatchOrder: { select: { dcNumber: true, tipo: true, status: true, updatedAt: true } },
      },
    });
  }

  /** Producto recibido en posta en inventario (no despachado en una DC cerrada). */
  private productosPosta(ctx: AuthContext, where: Prisma.PostaReceiptItemWhereInput = {}) {
    return this.prisma.postaReceiptItem.findMany({
      where: { plantId: ctx.plantId, receiptOrder: reciboEnInventario, ...despachoActivoONulo, ...where },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        codigo: true,
        netoKg: true,
        piezas: true,
        lote: true,
        conservacion: true,
        fechaVencimiento: true,
        createdAt: true,
        product: { select: { codigo: true, nombre: true } },
        receiptOrder: reciboSelect,
        despacho: dcSelect,
        createdBy: { select: { fullName: true } },
      },
    });
  }

  private reciboCanalFila(r: Awaited<ReturnType<InventariosService['canalesRecibidas']>>[number]) {
    const o = r.receiptOrder;
    const od = r.dispatchOrder;
    const dc = r.canalDispatchOrder;
    const cerradaOd = !!od && od.status !== DispatchOrderStatus.activo;
    const cerradaDc = !!dc && dc.status === DispatchOrderStatus.facturado;
    return {
      reference: o.receiptNumber,
      cliente: o.cliente.concepto,
      bodegaId: o.bodega?.id ?? null,
      bodega: o.bodega?.nombre ?? null,
      date: o.processDate.toISOString().slice(0, 10),
      pesoKg: Number(r.pesoKg),
      pesoFrioKg: r.despachoKg === null ? null : Number(r.despachoKg),
      cava: nombreCavaRecibo(r.cava),
      estado: od ? ('enOrden' as const) : dc ? ('enDespacho' as const) : ('disponibles' as const),
      enOrden: od
        ? { odNumber: od.odNumber, opNumbers: [] as number[], cerrada: cerradaOd, cerradaAt: cerradaOd ? od.updatedAt.toISOString() : null }
        : null,
      enDespacho: dc
        ? { dcNumber: dc.dcNumber, tipo: dc.tipo, cerrada: cerradaDc, cerradaAt: cerradaDc ? dc.updatedAt.toISOString() : null }
        : null,
      recibo: {
        receiptNumber: o.receiptNumber,
        codigo: r.codigo,
        guia: r.guia,
        lote: r.lote,
        identificacion: r.identificacion,
      },
    };
  }

  private async usuarios(ids: (string | null | undefined)[]) {
    const unicos = [...new Set(ids.filter((x): x is string => !!x))];
    const filas = unicos.length
      ? await this.prisma.appUser.findMany({ where: { id: { in: unicos } }, select: { id: true, fullName: true } })
      : [];
    const m = new Map(filas.map((u) => [u.id, u.fullName]));
    return (id: string | null | undefined) => (id ? (m.get(id) ?? null) : null);
  }

  private ordenRecibo(
    o: {
      receiptNumber: number;
      registrationDate: Date;
      processDate: Date;
      status: DispatchOrderStatus;
      createdAt: Date;
      createdById: string;
      cerradaAt: Date | null;
      cerradaById: string | null;
      cliente: { nit: string | null; concepto: string };
      bodega: { nombre: string } | null;
    },
    nombre: (id: string | null | undefined) => string | null,
  ) {
    return {
      receiptNumber: o.receiptNumber,
      registrationDate: o.registrationDate.toISOString().slice(0, 10),
      processDate: o.processDate.toISOString().slice(0, 10),
      status: o.status,
      createdAt: o.createdAt.toISOString(),
      creadaPor: nombre(o.createdById),
      cerradaAt: o.cerradaAt?.toISOString() ?? null,
      cerradaPor: nombre(o.cerradaById),
      cliente: o.cliente,
    };
  }

  /** Hoja de vida de una canal recibida de terceros: recibo, ingreso, cava, salida y reimpresiones. */
  async trazabilidadReciboCanal(ctx: AuthContext, itemId: string) {
    const i = await this.prisma.canalReceiptItem.findFirst({
      where: { id: itemId, plantId: ctx.plantId },
      include: {
        receiptOrder: { include: { cliente: { select: { nit: true, concepto: true } }, bodega: { select: { nombre: true } } } },
        dispatchOrder: { select: { odNumber: true, status: true, updatedAt: true } },
        canalDispatchOrder: { select: { dcNumber: true, tipo: true, status: true, updatedAt: true } },
      },
    });
    if (!i) throw new NotFoundException('Canal recibida no encontrada.');
    const reimpresiones = await this.prisma.canalReceiptReimpresion.findMany({ where: { itemId }, orderBy: { createdAt: 'asc' } });
    const o = i.receiptOrder;
    const nombre = await this.usuarios([
      i.createdById,
      o.createdById,
      o.cerradaById,
      i.despachadoById,
      ...reimpresiones.map((r) => r.userId),
    ]);
    const salida = i.dispatchOrder
      ? { tipo: 'proceso' as const, orden: `OD${i.dispatchOrder.odNumber}`, cerrada: i.dispatchOrder.status !== DispatchOrderStatus.activo, cerradaAt: i.dispatchOrder.updatedAt }
      : i.canalDispatchOrder
        ? {
            tipo: i.canalDispatchOrder.tipo,
            orden: `DC${i.canalDispatchOrder.dcNumber}`,
            cerrada: i.canalDispatchOrder.status === DispatchOrderStatus.facturado,
            cerradaAt: i.canalDispatchOrder.updatedAt,
          }
        : null;
    const enRecibo = !o.deletedAt && o.status === DispatchOrderStatus.facturado && !!o.bodegaId;
    return {
      orden: this.ordenRecibo(o, nombre),
      bodega: o.bodega ? { nombre: o.bodega.nombre, cliente: o.cliente.concepto } : null,
      enInventario: enRecibo && !salida?.cerrada,
      item: {
        id: i.id,
        codigo: i.codigo,
        cava: nombreCavaRecibo(i.cava),
        pesoKg: Number(i.pesoKg),
        guia: i.guia,
        lote: i.lote,
        identificacion: i.identificacion,
        createdAt: i.createdAt.toISOString(),
        registradoPor: nombre(i.createdById),
      },
      salida: salida && {
        ...salida,
        cerradaAt: salida.cerrada ? salida.cerradaAt.toISOString() : null,
        despachoKg: i.despachoKg === null ? null : Number(i.despachoKg),
        at: i.despachadoAt?.toISOString() ?? null,
        por: nombre(i.despachadoById),
      },
      reimpresiones: reimpresiones.map((r) => ({ at: r.createdAt.toISOString(), estacion: r.estacion, usuario: nombre(r.userId) })),
    };
  }

  /** Hoja de vida de un producto recibido en posta: recibo, pesaje, rótulo, salida y reimpresiones. */
  async trazabilidadReciboPosta(ctx: AuthContext, itemId: string) {
    const i = await this.prisma.postaReceiptItem.findFirst({
      where: { id: itemId, plantId: ctx.plantId },
      include: {
        product: { select: { codigo: true, nombre: true, categoria: true } },
        receiptOrder: { include: { cliente: { select: { nit: true, concepto: true } }, bodega: { select: { nombre: true } } } },
        despacho: {
          select: {
            netoKg: true,
            createdAt: true,
            createdById: true,
            canalDispatchOrder: { select: { dcNumber: true, status: true, updatedAt: true } },
          },
        },
      },
    });
    if (!i) throw new NotFoundException('Producto recibido no encontrado.');
    const reimpresiones = await this.prisma.postaReceiptReimpresion.findMany({ where: { itemId }, orderBy: { createdAt: 'asc' } });
    const o = i.receiptOrder;
    const nombre = await this.usuarios([
      i.createdById,
      o.createdById,
      o.cerradaById,
      i.despacho?.createdById,
      ...reimpresiones.map((r) => r.userId),
    ]);
    const dia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
    const d = i.despacho;
    const dcCerrada = d?.canalDispatchOrder.status === DispatchOrderStatus.facturado;
    const enRecibo = !o.deletedAt && o.status === DispatchOrderStatus.facturado && !!o.bodegaId;
    return {
      orden: this.ordenRecibo(o, nombre),
      bodega: o.bodega ? { nombre: o.bodega.nombre, cliente: o.cliente.concepto } : null,
      enInventario: enRecibo && !dcCerrada,
      item: {
        id: i.id,
        codigo: i.codigo,
        producto: i.product,
        taraKg: Number(i.taraKg),
        brutoKg: Number(i.brutoKg),
        netoKg: Number(i.netoKg),
        piezas: i.piezas,
        empaques: i.empaques,
        lote: i.lote,
        conservacion: i.conservacion,
        fechaSacrificio: dia(i.fechaSacrificio),
        fechaVencimiento: dia(i.fechaVencimiento),
        createdAt: i.createdAt.toISOString(),
        registradoPor: nombre(i.createdById),
      },
      salida: d && {
        tipo: 'posta' as const,
        orden: `DC${d.canalDispatchOrder.dcNumber}`,
        cerrada: dcCerrada,
        cerradaAt: dcCerrada ? d.canalDispatchOrder.updatedAt.toISOString() : null,
        despachoKg: Number(d.netoKg),
        at: d.createdAt.toISOString(),
        por: nombre(d.createdById),
      },
      reimpresiones: reimpresiones.map((r) => ({ at: r.createdAt.toISOString(), estacion: r.estacion, usuario: nombre(r.userId) })),
    };
  }

  /**
   * Busca en cava la pieza del código de barras del presinto:
   * `{lote}-{turno}{dígito}{I|D}` (dígito 1 = canal completa, 2 = izquierda, 3 = derecha).
   */
  async piezaPorBarcode(ctx: AuthContext, barcode: string) {
    const codigo = parseCanalBarcode(barcode);
    if (!codigo) throw new BadRequestException('Código de barras no válido.');

    const p = await this.prisma.canalPieza.findFirst({
      where: {
        pieza: codigo.pieza,
        turno: codigo.turno,
        evento: {
          ordenBeneficio: {
            plantId: ctx.plantId,
            deletedAt: null,
            reference: codigo.lote,
          },
        },
      },
      orderBy: { weighedAt: 'desc' },
      include: {
        evento: {
          include: {
            ordenBeneficio: { select: { reference: true, cliente: true, date: true } },
          },
        },
      },
    });
    if (!p) throw new NotFoundException(`No se encontró la canal ${barcode.trim()}.`);
    if (!p.cava) {
      throw new BadRequestException(`La canal ${barcode.trim()} no está en ninguna cava.`);
    }
    return {
      piezaId: p.id,
      barcode: barcode.trim().toUpperCase(),
      reference: p.evento.ordenBeneficio.reference,
      cliente: p.evento.ordenBeneficio.cliente,
      date: p.evento.ordenBeneficio.date.toISOString().slice(0, 10),
      canalAnimalTipo: p.evento.canalAnimalTipo,
      pieza: p.pieza,
      destino: p.destino,
      cava: p.cava,
      pesoKg: Number(p.pesoKg),
      sequence: p.evento.sequence,
      turno: p.turno,
      observaciones: p.observaciones,
    };
  }

  /**
   * Piezas de canal (CIZQ/CDER/completa) en una cava de Canal Caliente. Las que ya están en
   * una orden de despacho activa siguen contando en su cava hasta que la orden se cierre,
   * marcadas con la orden (y la de producción) en la que están.
   */
  async cava(ctx: AuthContext, cava: string, dateStr?: string) {
    const date = dateStr ? plantDateOnly(dateStr) : undefined;
    const piezas = await this.prisma.canalPieza.findMany({
      where: {
        OR: [
          { cava },
          {
            despacho: {
              cavaOrigen: cava,
              dispatchOrder: { status: DispatchOrderStatus.activo, deletedAt: null },
            },
          },
          {
            despachoCanal: {
              cavaOrigen: cava,
              canalDispatchOrder: { status: DispatchOrderStatus.activo, deletedAt: null },
            },
          },
        ],
        evento: {
          ordenBeneficio: {
            plantId: ctx.plantId,
            deletedAt: null,
            ...(date && { date }),
          },
        },
      },
      orderBy: [{ weighedAt: 'desc' }],
      include: {
        evento: {
          include: {
            ordenBeneficio: {
              select: { reference: true, cliente: true, date: true },
            },
          },
        },
        despacho: {
          select: {
            dispatchOrder: {
              select: {
                odNumber: true,
                productionOrders: {
                  where: { deletedAt: null },
                  select: { opNumber: true },
                  orderBy: { opNumber: 'asc' },
                },
              },
            },
          },
        },
        despachoCanal: { select: { canalDispatchOrder: { select: { dcNumber: true, tipo: true } } } },
      },
      take: 300,
    });
    const numCava = /^CAVA (\d+)$/.exec(cava)?.[1];
    const recibidas = numCava
      ? await this.canalesRecibidas(ctx, {
          cava: Number(numCava),
          ...(date && { receiptOrder: { ...reciboEnInventario, processDate: date } }),
        })
      : [];
    const deRecibo = recibidas.map((r) => {
      const f = this.reciboCanalFila(r);
      return {
        piezaId: r.id,
        eventoId: '',
        reference: f.reference,
        cliente: f.cliente,
        date: f.date,
        canalAnimalTipo: null,
        canalTipo: null,
        sequence: r.codigo,
        turno: null,
        pieza: 'canal' as const,
        bodega: f.bodega,
        destino: null,
        observaciones: null,
        pesoKg: f.pesoKg,
        enOrden: f.enOrden && { odNumber: f.enOrden.odNumber, opNumbers: [] as number[] },
        enDespacho: f.enDespacho && { dcNumber: f.enDespacho.dcNumber, tipo: f.enDespacho.tipo },
        recibo: f.recibo,
      };
    });
    return [
      ...deRecibo,
      ...piezas.map((p) => ({
        piezaId: p.id,
        eventoId: p.eventoId,
        reference: p.evento.ordenBeneficio.reference,
        cliente: p.evento.ordenBeneficio.cliente,
        date: p.evento.ordenBeneficio.date.toISOString().slice(0, 10),
        canalAnimalTipo: p.evento.canalAnimalTipo,
        canalTipo: p.evento.canalTipo,
        sequence: p.evento.sequence,
        turno: p.turno,
        pieza: p.pieza,
        bodega: p.bodega,
        destino: p.destino,
        observaciones: p.observaciones,
        pesoKg: Number(p.pesoKg),
        enOrden: p.despacho
          ? {
              odNumber: p.despacho.dispatchOrder.odNumber,
              opNumbers: p.despacho.dispatchOrder.productionOrders.map((o) => o.opNumber),
            }
          : null,
        enDespacho: p.despachoCanal ? p.despachoCanal.canalDispatchOrder : null,
        recibo: null,
      })),
    ];
  }

  /**
   * Canales que siguen en inventario: en una cava o dentro de una orden de despacho (OD o DC)
   * activa. Con `incluirDespachadas` también trae las de órdenes cerradas: DC (frío/caliente),
   * que se muestran como despachadas, y OD a proceso, que se muestran como procesadas.
   */
  private canalEnInventario(
    ctx: AuthContext,
    cliente?: string,
    incluirDespachadas = false,
  ): Prisma.CanalPiezaWhereInput {
    return {
      OR: [
        { cava: { not: null } },
        { despacho: { dispatchOrder: { status: DispatchOrderStatus.activo, deletedAt: null } } },
        {
          despachoCanal: {
            canalDispatchOrder: { status: DispatchOrderStatus.activo, deletedAt: null },
          },
        },
        ...(incluirDespachadas
          ? [
              {
                despachoCanal: {
                  canalDispatchOrder: { status: DispatchOrderStatus.facturado, deletedAt: null },
                },
              },
              {
                despacho: {
                  dispatchOrder: { status: DispatchOrderStatus.facturado, deletedAt: null },
                },
              },
            ]
          : []),
      ],
      evento: {
        ordenBeneficio: { plantId: ctx.plantId, deletedAt: null, ...(cliente && { cliente }) },
      },
    };
  }

  /** Bodegas (internas del software) de todos los clientes con lo que tiene cada una. */
  async bodegas(ctx: AuthContext) {
    const [bodegas, canales, productos, acond] = await Promise.all([
      this.prisma.bodega.findMany({
        where: { active: true },
        select: {
          id: true,
          code: true,
          nombre: true,
          cliente: { select: { id: true, nit: true, concepto: true } },
        },
        orderBy: [{ cliente: { concepto: 'asc' } }, { code: 'asc' }],
      }),
      this.prisma.canalPieza.findMany({
        where: { ...this.canalEnInventario(ctx, undefined, true), bodega: { not: null } },
        select: {
          bodega: true,
          pesoKg: true,
          evento: { select: { ordenBeneficio: { select: { cliente: true } } } },
          despachoCanal: { select: { canalDispatchOrder: { select: { status: true } } } },
          despacho: { select: { dispatchOrder: { select: { status: true } } } },
        },
      }),
      this.prisma.rotuladoEtiqueta.groupBy({
        by: ['bodegaId'],
        where: { plantId: ctx.plantId, deletedAt: null, bodegaId: { not: null }, ...etiquetaNoDespachada },
        _count: { _all: true },
        _sum: { netoKg: true },
      }),
      this.prisma.acondicionamientoEtiqueta.groupBy({
        by: ['bodegaId'],
        where: { plantId: ctx.plantId, deletedAt: null, bodegaId: { not: null }, ...noDespachado },
        _count: { _all: true },
        _sum: { netoKg: true },
      }),
    ]);
    // La canal guarda el nombre de la bodega; se cruza con su cliente.
    const canalesPor = new Map<string, { n: number; kg: number; despachadas: number; procesadas: number }>();
    for (const c of canales) {
      const clave = `${c.evento.ordenBeneficio.cliente}|${c.bodega}`;
      const acc = canalesPor.get(clave) ?? { n: 0, kg: 0, despachadas: 0, procesadas: 0 };
      if (c.despachoCanal?.canalDispatchOrder.status === DispatchOrderStatus.facturado) {
        acc.despachadas += 1;
      } else if (c.despacho?.dispatchOrder.status === DispatchOrderStatus.facturado) {
        acc.procesadas += 1;
      } else {
        acc.n += 1;
        acc.kg += Number(c.pesoKg);
      }
      canalesPor.set(clave, acc);
    }
    const subproductosPor = await this.subproductosPorBodega(ctx);
    const [recibidas, posta] = await Promise.all([
      this.canalesRecibidas(ctx, {}, true),
      this.productosPosta(ctx),
    ]);
    const recibosPor = new Map<
      string,
      { canales: number; canalesKg: number; despachadas: number; procesadas: number; productos: number; productosKg: number }
    >();
    const reciboDe = (bodegaId: string | null) => {
      if (!bodegaId) return null;
      const acc = recibosPor.get(bodegaId) ?? { canales: 0, canalesKg: 0, despachadas: 0, procesadas: 0, productos: 0, productosKg: 0 };
      recibosPor.set(bodegaId, acc);
      return acc;
    };
    for (const r of recibidas) {
      const acc = reciboDe(r.receiptOrder.bodega?.id ?? null);
      if (!acc) continue;
      const f = this.reciboCanalFila(r);
      if (f.enDespacho?.cerrada) acc.despachadas += 1;
      else if (f.enOrden?.cerrada) acc.procesadas += 1;
      else {
        acc.canales += 1;
        acc.canalesKg += f.pesoKg;
      }
    }
    for (const p of posta) {
      const acc = reciboDe(p.receiptOrder.bodega?.id ?? null);
      if (!acc) continue;
      acc.productos += 1;
      acc.productosKg += Number(p.netoKg);
    }
    return bodegas.map((b) => {
      const p = productos.find((x) => x.bodegaId === b.id);
      const a = acond.find((x) => x.bodegaId === b.id);
      const rc = recibosPor.get(b.id);
      const clave = `${b.cliente.concepto}|${b.nombre}`;
      return {
        id: b.id,
        code: b.code,
        nombre: b.nombre,
        clienteId: b.cliente.id,
        clienteNit: b.cliente.nit,
        cliente: b.cliente.concepto,
        canales: (canalesPor.get(clave)?.n ?? 0) + (rc?.canales ?? 0),
        canalesKg: r2((canalesPor.get(clave)?.kg ?? 0) + (rc?.canalesKg ?? 0)),
        canalesDespachadas: (canalesPor.get(clave)?.despachadas ?? 0) + (rc?.despachadas ?? 0),
        canalesProcesadas: (canalesPor.get(clave)?.procesadas ?? 0) + (rc?.procesadas ?? 0),
        productos: (p?._count._all ?? 0) + (a?._count._all ?? 0) + (rc?.productos ?? 0),
        productosKg: r2(Number(p?._sum.netoKg ?? 0) + Number(a?._sum.netoKg ?? 0) + (rc?.productosKg ?? 0)),
        subproductos: subproductosPor.get(clave) ?? 0,
      };
    });
  }

  /**
   * Los subproductos no guardan bodega: se ubican en la bodega donde quedaron las canales
   * de su misma orden de beneficio. Devuelve `cliente|bodega` -> ítems en cava.
   */
  private async subproductosPorBodega(ctx: AuthContext) {
    const items = await this.prisma.subproductoItem.findMany({
      where: {
        cava: { not: null },
        evento: { ordenBeneficio: { plantId: ctx.plantId, deletedAt: null } },
      },
      select: { evento: { select: { ordenBeneficioId: true } } },
    });
    const porOrden = new Map<string, number>();
    for (const i of items) {
      const id = i.evento.ordenBeneficioId;
      porOrden.set(id, (porOrden.get(id) ?? 0) + 1);
    }
    const resultado = new Map<string, number>();
    if (!porOrden.size) return resultado;

    const piezas = await this.prisma.canalPieza.findMany({
      where: { bodega: { not: null }, evento: { ordenBeneficioId: { in: [...porOrden.keys()] } } },
      select: {
        bodega: true,
        evento: { select: { ordenBeneficioId: true, ordenBeneficio: { select: { cliente: true } } } },
      },
    });
    const vistos = new Set<string>();
    for (const p of piezas) {
      const clave = `${p.evento.ordenBeneficio.cliente}|${p.bodega}`;
      const unico = `${p.evento.ordenBeneficioId}|${clave}`;
      if (vistos.has(unico)) continue;
      vistos.add(unico);
      resultado.set(clave, (resultado.get(clave) ?? 0) + (porOrden.get(p.evento.ordenBeneficioId) ?? 0));
    }
    return resultado;
  }

  /** Inventario completo de una bodega: canales y productos rotulados, con su estado. */
  async bodega(ctx: AuthContext, bodegaId: string) {
    const b = await this.prisma.bodega.findUnique({
      where: { id: bodegaId },
      select: {
        id: true,
        code: true,
        nombre: true,
        cliente: { select: { id: true, nit: true, concepto: true } },
      },
    });
    if (!b) throw new NotFoundException('Bodega no encontrada.');
    const otSelect = {
      select: {
        transferOrder: {
          select: {
            otNumber: true,
            conditioningOrders: {
              where: { deletedAt: null },
              orderBy: { ocNumber: 'asc' },
              select: { ocNumber: true, status: true },
            },
          },
        },
      },
    } as const;

    const [canales, etiquetas, acond, subproductos] = await Promise.all([
      this.prisma.canalPieza.findMany({
        where: { ...this.canalEnInventario(ctx, b.cliente.concepto, true), bodega: b.nombre },
        orderBy: { weighedAt: 'desc' },
        select: {
          id: true,
          pieza: true,
          weighedAt: true,
          turno: true,
          cava: true,
          destino: true,
          observaciones: true,
          pesoKg: true,
          evento: {
            select: {
              sequence: true,
              canalTipo: true,
              canalAnimalTipo: true,
              ordenBeneficio: { select: { reference: true, date: true } },
            },
          },
          despacho: {
            select: {
              cavaOrigen: true,
              despachoKg: true,
              dispatchOrder: {
                select: {
                  odNumber: true,
                  status: true,
                  updatedAt: true,
                  productionOrders: {
                    where: { deletedAt: null },
                    select: { opNumber: true },
                    orderBy: { opNumber: 'asc' },
                  },
                },
              },
            },
          },
          despachoCanal: {
            select: {
              cavaOrigen: true,
              despachoKg: true,
              canalDispatchOrder: {
                select: { dcNumber: true, tipo: true, status: true, updatedAt: true },
              },
            },
          },
        },
      }),
      this.prisma.rotuladoEtiqueta.findMany({
        where: { plantId: ctx.plantId, bodegaId: b.id, deletedAt: null, ...etiquetaNoDespachada },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          codigo: true,
          pieza: true,
          netoKg: true,
          conservacion: true,
          sobrante: true,
          fechaEmpaque: true,
          fechaVencimiento: true,
          product: { select: { codigo: true, nombre: true } },
          tienda: { select: { codigo: true, nombre: true } },
          createdBy: { select: { fullName: true } },
          productionOrder: { select: { opNumber: true, cerradaAt: true } },
          traslado: otSelect,
          despacho: dcSelect,
          canastilla: { select: { numero: true, traslado: otSelect, despacho: dcSelect } },
        },
      }),
      this.prisma.acondicionamientoEtiqueta.findMany({
        where: { plantId: ctx.plantId, bodegaId: b.id, deletedAt: null, ...noDespachado },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          codigo: true,
          pieza: true,
          netoKg: true,
          conservacion: true,
          fechaEmpaque: true,
          fechaVencimiento: true,
          product: { select: { codigo: true, nombre: true } },
          tienda: { select: { codigo: true, nombre: true } },
          createdBy: { select: { fullName: true } },
          conditioningOrder: {
            select: { ocNumber: true, transferOrder: { select: { otNumber: true } } },
          },
          despacho: dcSelect,
        },
      }),
      this.prisma.subproductoItem.findMany({
        where: {
          cava: { not: null },
          evento: {
            ordenBeneficio: {
              plantId: ctx.plantId,
              deletedAt: null,
              cliente: b.cliente.concepto,
              eventos: { some: { canalPiezas: { some: { bodega: b.nombre } } } },
            },
          },
        },
        orderBy: { registradoAt: 'desc' },
        select: {
          id: true,
          tipo: true,
          cava: true,
          pesoKg: true,
          registradoAt: true,
          evento: { select: { ordenBeneficio: { select: { reference: true, date: true } } } },
        },
      }),
    ]);
    const dia = (d: Date) => d.toISOString().slice(0, 10);
    const hoy = plantDateOnly();
    const ahora = Date.now();

    // Lo recibido de terceros que entró a esta bodega al cerrar su recibo.
    const [recibidas, posta] = await Promise.all([
      this.canalesRecibidas(ctx, { receiptOrder: { ...reciboEnInventario, bodegaId: b.id } }, true),
      this.productosPosta(ctx, { receiptOrder: { ...reciboEnInventario, bodegaId: b.id } }),
    ]);
    const canalesRecibo = recibidas.map((r) => {
      const f = this.reciboCanalFila(r);
      return {
        id: r.id,
        bodega: b.nombre,
        reference: f.reference,
        date: f.date,
        sequence: r.codigo,
        turno: null,
        canalTipo: null,
        canalAnimalTipo: null,
        pieza: 'canal' as const,
        cava: f.cava,
        destino: null,
        observaciones: null,
        pesoKg: f.pesoKg,
        semaforo: semaforoCanal(r.createdAt, ahora),
        pesoFrioKg: f.pesoFrioKg,
        enOrden: f.enOrden,
        enDespacho: f.enDespacho,
        recibo: f.recibo,
      };
    });
    const productosPosta = posta.map((p) => ({
      id: p.id,
      bodega: b.nombre,
      codigo: `RP${p.receiptOrder.receiptNumber}-${String(p.codigo).padStart(2, '0')}`,
      pieza: p.codigo,
      unidades: p.piezas,
      productoCodigo: p.product.codigo,
      productoNombre: p.product.nombre,
      tiendaCodigo: '',
      tienda: 'RECIBO EN POSTA',
      canastilla: null,
      netoKg: Number(p.netoKg),
      conservacion: (p.conservacion ?? '').toUpperCase(),
      sobrante: false,
      fechaEmpaque: dia(p.createdAt),
      fechaVencimiento: p.fechaVencimiento ? dia(p.fechaVencimiento) : null,
      semaforo: semaforoVencimiento(p.fechaVencimiento, hoy),
      opNumber: null,
      desposteCerradoAt: null,
      ocNumber: null,
      trasladoOt: null,
      transformadoOc: null,
      origenOt: null,
      despachoDc: p.despacho?.canalDispatchOrder.dcNumber ?? null,
      rpNumber: p.receiptOrder.receiptNumber as number | null,
      lote: p.lote,
      etiquetadoPor: p.createdBy.fullName,
    }));

    return {
      id: b.id,
      code: b.code,
      nombre: b.nombre,
      clienteNit: b.cliente.nit,
      cliente: b.cliente.concepto,
      canales: [
        ...canalesRecibo,
        ...canales.map((c) => ({
        id: c.id,
        bodega: b.nombre,
        reference: c.evento.ordenBeneficio.reference,
        date: dia(c.evento.ordenBeneficio.date),
        sequence: c.evento.sequence,
        turno: c.turno,
        canalTipo: c.evento.canalTipo,
        canalAnimalTipo: c.evento.canalAnimalTipo,
        pieza: c.pieza,
        cava: c.cava ?? c.despacho?.cavaOrigen ?? c.despachoCanal?.cavaOrigen ?? null,
        destino: c.destino,
        observaciones: c.observaciones,
        pesoKg: Number(c.pesoKg),
        semaforo: semaforoCanal(c.weighedAt, ahora),
        pesoFrioKg:
          c.despacho?.despachoKg != null
            ? Number(c.despacho.despachoKg)
            : c.despachoCanal?.despachoKg != null
              ? Number(c.despachoCanal.despachoKg)
              : null,
        enOrden: c.despacho
          ? {
              odNumber: c.despacho.dispatchOrder.odNumber,
              opNumbers: c.despacho.dispatchOrder.productionOrders.map((o) => o.opNumber),
              cerrada: c.despacho.dispatchOrder.status !== DispatchOrderStatus.activo,
              cerradaAt:
                c.despacho.dispatchOrder.status !== DispatchOrderStatus.activo
                  ? c.despacho.dispatchOrder.updatedAt.toISOString()
                  : null,
            }
          : null,
        enDespacho: c.despachoCanal
          ? (() => {
              const dc = c.despachoCanal.canalDispatchOrder;
              const cerrada = dc.status === DispatchOrderStatus.facturado;
              return {
                dcNumber: dc.dcNumber,
                tipo: dc.tipo,
                cerrada,
                cerradaAt: cerrada ? dc.updatedAt.toISOString() : null,
              };
            })()
          : null,
        recibo: null,
      })),
      ],
      productos: [
        ...etiquetas.map((e) => {
          const ot = e.traslado?.transferOrder ?? e.canastilla?.traslado?.transferOrder ?? null;
          // Si la OC de su OT ya se cerró, la pieza se transformó en otro producto.
          const transformada = ot?.conditioningOrders.find((o) => o.status === 'facturado');
          return {
            id: e.id,
            bodega: b.nombre,
            codigo: e.codigo,
            pieza: e.pieza,
            unidades: 1,
            productoCodigo: e.product.codigo,
            productoNombre: e.product.nombre,
            tiendaCodigo: e.tienda.codigo,
            tienda: e.tienda.nombre,
            canastilla: e.canastilla?.numero ?? null,
            netoKg: Number(e.netoKg),
            conservacion: e.conservacion,
            sobrante: e.sobrante,
            fechaEmpaque: dia(e.fechaEmpaque),
            fechaVencimiento: e.fechaVencimiento ? dia(e.fechaVencimiento) : null,
            semaforo: semaforoVencimiento(e.fechaVencimiento, hoy),
            opNumber: e.productionOrder.opNumber as number | null,
            desposteCerradoAt: e.productionOrder.cerradaAt?.toISOString() ?? null,
            ocNumber: null as number | null,
            trasladoOt: ot?.otNumber ?? null,
            transformadoOc: transformada?.ocNumber ?? null,
            origenOt: null as number | null,
            despachoDc:
              (e.despacho ?? e.canastilla?.despacho)?.canalDispatchOrder.dcNumber ?? (null as number | null),
            rpNumber: null as number | null,
            lote: `OP${e.productionOrder.opNumber}`,
            etiquetadoPor: e.createdBy.fullName,
          };
        }),
        ...acond.map((e) => ({
          id: e.id,
          bodega: b.nombre,
          codigo: e.codigo,
          pieza: e.pieza,
          unidades: 1,
          productoCodigo: e.product.codigo,
          productoNombre: e.product.nombre,
          tiendaCodigo: e.tienda.codigo,
          tienda: e.tienda.nombre,
          canastilla: null,
          netoKg: Number(e.netoKg),
          conservacion: e.conservacion,
          sobrante: false,
          fechaEmpaque: dia(e.fechaEmpaque),
          fechaVencimiento: e.fechaVencimiento ? dia(e.fechaVencimiento) : null,
          semaforo: semaforoVencimiento(e.fechaVencimiento, hoy),
          opNumber: null,
          desposteCerradoAt: null,
          ocNumber: e.conditioningOrder.ocNumber,
          trasladoOt: null,
          transformadoOc: null,
          origenOt: e.conditioningOrder.transferOrder.otNumber,
          despachoDc: e.despacho?.canalDispatchOrder.dcNumber ?? null,
          rpNumber: null,
          lote: `OC${e.conditioningOrder.ocNumber}`,
          etiquetadoPor: e.createdBy.fullName,
        })),
        ...productosPosta,
      ],
      subproductos: subproductos.map((i) => {
        const def = SUBPRODUCTO_ITEM_BY_TIPO.get(i.tipo);
        return {
          id: i.id,
          tipo: i.tipo,
          codigo: def?.codigo ?? '',
          label: def?.label ?? i.tipo,
          unidad: def?.unidad ?? 'unidad',
          categoria: def?.categoria ?? 'retoma',
          cantidad: def?.unidad === 'kg' ? null : (def?.multiplicador ?? 1),
          pesoKg: i.pesoKg ? Number(i.pesoKg) : null,
          cava: i.cava,
          reference: i.evento.ordenBeneficio.reference,
          date: dia(i.evento.ordenBeneficio.date),
          registradoAt: i.registradoAt?.toISOString() ?? null,
        };
      }),
    };
  }

  /** Subproductos (vísceras) actualmente ubicados en una cava de subproducto. */
  async cavaSubproducto(ctx: AuthContext, cava: string, dateStr?: string) {
    const date = dateStr ? plantDateOnly(dateStr) : undefined;
    const items = await this.prisma.subproductoItem.findMany({
      where: {
        cava,
        evento: {
          ordenBeneficio: {
            plantId: ctx.plantId,
            deletedAt: null,
            ...(date && { date }),
          },
        },
      },
      orderBy: [{ registradoAt: 'desc' }],
      include: {
        evento: {
          select: {
            ordenBeneficio: {
              select: { reference: true, cliente: true, date: true },
            },
          },
        },
      },
      take: 300,
    });
    return items.map((i) => {
      const def = SUBPRODUCTO_ITEM_BY_TIPO.get(i.tipo);
      return {
        itemId: i.id,
        tipo: i.tipo,
        codigo: def?.codigo ?? '',
        label: def?.label ?? i.tipo,
        unidad: def?.unidad ?? 'unidad',
        categoria: def?.categoria ?? 'retoma',
        cantidad: def?.unidad === 'unidad' ? (def?.multiplicador ?? 1) : null,
        pesoKg: i.pesoKg ? Number(i.pesoKg) : null,
        reference: i.evento.ordenBeneficio.reference,
        cliente: i.evento.ordenBeneficio.cliente,
        date: i.evento.ordenBeneficio.date.toISOString().slice(0, 10),
        registradoAt: i.registradoAt?.toISOString() ?? null,
      };
    });
  }

  /**
   * Trazabilidad completa de una pieza de canal: guía (Peso en Camión), Peso en Pie, orden de
   * beneficio, sacrificio, piel, canal caliente, movimientos de cava, subproductos del animal y
   * despacho (OD a proceso o DC frío/caliente). El animal N de la orden se cruza con el N de su
   * guía en Peso en Pie, igual que el informe de proceso general.
   */
  async trazabilidadCanal(ctx: AuthContext, piezaId: string) {
    const p = await this.prisma.canalPieza.findFirst({
      where: { id: piezaId, evento: { ordenBeneficio: { plantId: ctx.plantId, deletedAt: null } } },
      include: {
        evento: {
          include: {
            ordenBeneficio: true,
            canalPiezas: { select: { id: true, pieza: true, pesoKg: true, turno: true } },
            subproductos: true,
          },
        },
        trasladosCava: { orderBy: { createdAt: 'asc' } },
        despacho: {
          include: {
            dispatchOrder: {
              select: {
                odNumber: true,
                status: true,
                type: true,
                processDate: true,
                updatedAt: true,
                cliente: { select: { concepto: true } },
                productionOrders: {
                  where: { deletedAt: null },
                  orderBy: { opNumber: 'asc' },
                  select: {
                    id: true,
                    opNumber: true,
                    status: true,
                    processDate: true,
                    _count: { select: { etiquetas: { where: { deletedAt: null } } } },
                  },
                },
              },
            },
          },
        },
        despachoCanal: {
          include: {
            canalDispatchOrder: {
              select: {
                dcNumber: true,
                tipo: true,
                status: true,
                processDate: true,
                registrationDate: true,
                createdAt: true,
                createdById: true,
                updatedAt: true,
                cliente: { select: { concepto: true, nit: true } },
                items: { select: { pesoCalienteKg: true, despachoKg: true } },
              },
            },
          },
        },
      },
    });
    if (!p) throw new NotFoundException('Canal no encontrada.');
    const e = p.evento;
    const orden = e.ordenBeneficio;
    const guias = orden.guias.map((g) => g.trim()).filter(Boolean);
    const guia = guias.length === 1 ? guias[0] : null;
    const destinoProceso = p.despacho
      ? await this.productosDeOps(
          ctx,
          p.despacho.dispatchOrderId,
          p.despacho.dispatchOrder.productionOrders.map((o) => o.id),
          p.eventoId,
        )
      : null;

    const [camiones, asignado, animalesPie, previas] = await Promise.all([
      guias.length
        ? this.prisma.pesoCamion.findMany({
            where: { plantId: ctx.plantId, deletedAt: null, guia: { in: guias } },
            orderBy: { date: 'desc' },
          })
        : [],
      // Animal asignado a la orden en Peso en Pie (sirve también con varias guías).
      this.prisma.pesoEnPie.findFirst({
        where: { plantId: ctx.plantId, deletedAt: null, ordenBeneficioId: orden.id, ordenSequence: e.sequence },
        include: { repesajes: { orderBy: { ronda: 'asc' } } },
      }),
      guia
        ? this.prisma.pesoEnPie.findMany({
            where: { plantId: ctx.plantId, deletedAt: null, date: orden.date, guia },
            include: { repesajes: { orderBy: { ronda: 'asc' } } },
            orderBy: { reference: 'asc' },
          })
        : [],
      guia
        ? this.prisma.ordenBeneficio.aggregate({
            _sum: { animalCount: true },
            where: {
              plantId: ctx.plantId,
              deletedAt: null,
              date: orden.date,
              guias: { has: guia },
              reference: { lt: orden.reference },
            },
          })
        : null,
    ]);
    // Asignación explícita a la orden; si no existe (órdenes antiguas de una guía), por posición en la guía.
    const pie =
      asignado ??
      (animalesPie.some((a) => a.ordenBeneficioId === orden.id)
        ? undefined
        : animalesPie.find((a) => a.reference === (previas?._sum.animalCount ?? 0) + e.sequence));
    // La guía del animal (con varias guías sale de su registro en Peso en Pie); se prefiere el
    // camión del mismo día o el anterior más cercano a la fecha de beneficio.
    const guiaAnimal = pie?.guia?.trim() || guia;
    const delAnimal = camiones.filter((c) => c.guia?.trim() === guiaAnimal);
    const camion = delAnimal.find((c) => c.date <= orden.date) ?? delAnimal[0] ?? null;

    const ids = new Set<string>([orden.createdById, e.operatorId, p.operatorId]);
    if (e.pielOperatorId) ids.add(e.pielOperatorId);
    if (orden.subproductoRetiroById) ids.add(orden.subproductoRetiroById);
    if (camion) ids.add(camion.createdById);
    if (pie) {
      ids.add(pie.createdById);
      pie.repesajes.forEach((r) => ids.add(r.operatorId));
    }
    p.trasladosCava.forEach((t) => ids.add(t.operatorId));
    e.subproductos.forEach((s) => s.operatorId && ids.add(s.operatorId));
    if (p.despacho) ids.add(p.despacho.createdById);
    if (p.despachoCanal) {
      ids.add(p.despachoCanal.createdById);
      ids.add(p.despachoCanal.canalDispatchOrder.createdById);
    }
    const usuarios = await this.prisma.appUser.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, fullName: true },
    });
    const nombre = new Map(usuarios.map((u) => [u.id, u.fullName]));
    const quien = (id: string | null | undefined) => (id ? (nombre.get(id) ?? '—') : null);
    const num = (d: { toString(): string } | null | undefined) => (d == null ? null : Number(d));
    const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
    const dia = (d: Date) => d.toISOString().slice(0, 10);
    const ordenPieza = { canal: 0, cizq: 1, cder: 2 } as const;

    const od = p.despacho;
    const dc = p.despachoCanal;
    const pesoInicialPie = pie
      ? pie.repesajes.length
        ? Number(pie.repesajes[0].pesoAnteriorKg)
        : num(pie.pesoTotalKg)
      : null;

    let estado: 'disponible' | 'en_proceso' | 'procesada' | 'en_despacho' | 'despachada' | 'sin_cava';
    if (dc) estado = dc.canalDispatchOrder.status === DispatchOrderStatus.facturado ? 'despachada' : 'en_despacho';
    else if (od) estado = od.dispatchOrder.status === DispatchOrderStatus.activo ? 'en_proceso' : 'procesada';
    else estado = p.cava ? 'disponible' : 'sin_cava';

    return {
      piezaId: p.id,
      pieza: p.pieza,
      turno: p.turno,
      canalTipo: e.canalTipo,
      estado,
      cavaActual: p.cava,
      guia: camion
        ? {
            guia: camion.guia,
            bcReference: camion.reference,
            referenciaLote: camion.referenciaLote,
            date: dia(camion.date),
            proveedor: camion.proveedor,
            procedencia: camion.procedencia,
            cliente: camion.cliente,
            placa: camion.placa,
            conductor: camion.conductor,
            cantidad: camion.cantidad,
            entradaKg: num(camion.entrada),
            salidaKg: num(camion.salida),
            netoKg: num(camion.netoKg),
            promedioKg: num(camion.pesoPromedioKg),
            observaciones: camion.observaciones,
            registradaPor: quien(camion.createdById),
            createdAt: camion.createdAt.toISOString(),
          }
        : null,
      guias: orden.guias,
      pie: pie
        ? {
            bpReference: pie.bpReference,
            reference: pie.reference,
            corral: pie.corral,
            tipoAnimal: pie.tipoAnimal,
            tipoPesaje: pie.tipoPesaje,
            pesoInicialKg: pesoInicialPie,
            pesoActualKg: num(pie.pesoTotalKg),
            repesajes: pie.repesajes.map((r) => ({
              ronda: r.ronda,
              pesoAnteriorKg: Number(r.pesoAnteriorKg),
              pesoNuevoKg: Number(r.pesoNuevoKg),
              mermaKg: Number(r.mermaKg),
              at: r.createdAt.toISOString(),
              operario: quien(r.operatorId),
            })),
            observaciones: pie.observaciones,
            pesadoAt: pie.createdAt.toISOString(),
            operario: quien(pie.createdById),
          }
        : null,
      ordenBeneficio: {
        reference: orden.reference,
        date: dia(orden.date),
        cliente: orden.cliente,
        animalCount: orden.animalCount,
        status: orden.status,
        observaciones: orden.observaciones,
        subproductoDestino: orden.subproductoDestino,
        creadaPor: quien(orden.createdById),
        createdAt: orden.createdAt.toISOString(),
      },
      sacrificio: {
        sequence: e.sequence,
        at: e.stunnedAt.toISOString(),
        operario: quien(e.operatorId),
      },
      piel: e.pesoPielKg != null || e.pieladoAt
        ? { kg: num(e.pesoPielKg), at: iso(e.pieladoAt), operario: quien(e.pielOperatorId) }
        : null,
      canal: {
        tipoAnimal: e.canalAnimalTipo,
        canalTipo: e.canalTipo,
        conCola: e.conCola,
        expendio: e.expendio,
        pesoKg: Number(p.pesoKg),
        weighedAt: p.weighedAt.toISOString(),
        operario: quien(p.operatorId),
        bodega: p.bodega,
        destino: p.destino,
        observaciones: p.observaciones,
        piezasAnimal: e.canalPiezas
          .sort((a, b) => ordenPieza[a.pieza] - ordenPieza[b.pieza])
          .map((x) => ({
            id: x.id,
            pieza: x.pieza,
            pesoKg: Number(x.pesoKg),
            turno: x.turno,
            actual: x.id === p.id,
          })),
      },
      traslados: p.trasladosCava.map((t) => ({
        cavaOrigen: t.cavaOrigen,
        cavaDestino: t.cavaDestino,
        motivo: t.motivo,
        at: t.createdAt.toISOString(),
        operario: quien(t.operatorId),
      })),
      subproductos: e.subproductos
        .filter((s) => s.marcado || s.pesoKg != null)
        .map((s) => {
          const def = SUBPRODUCTO_ITEM_BY_TIPO.get(s.tipo);
          return {
            tipo: s.tipo,
            label: def?.label ?? s.tipo,
            codigo: def?.codigo ?? '',
            categoria: def?.categoria ?? 'retoma',
            unidad: def?.unidad ?? 'unidad',
            cantidad: def?.unidad === 'kg' ? null : (def?.multiplicador ?? 1),
            pesoKg: num(s.pesoKg),
            cava: s.cava,
            at: iso(s.registradoAt),
            operario: quien(s.operatorId),
          };
        }),
      despachoProceso: od
        ? {
            odNumber: od.dispatchOrder.odNumber,
            status: od.dispatchOrder.status,
            cliente: od.dispatchOrder.cliente.concepto,
            processDate: dia(od.dispatchOrder.processDate),
            cavaOrigen: od.cavaOrigen,
            pesoCalienteKg: Number(od.pesoCalienteKg),
            despachoKg: num(od.despachoKg),
            pistoleadaAt: od.createdAt.toISOString(),
            operario: quien(od.createdById),
            cerradaAt:
              od.dispatchOrder.status === DispatchOrderStatus.activo
                ? null
                : od.dispatchOrder.updatedAt.toISOString(),
            ordenesProduccion: od.dispatchOrder.productionOrders.map((op) => ({
              opNumber: op.opNumber,
              status: op.status,
              processDate: dia(op.processDate),
              etiquetas: op._count.etiquetas,
            })),
            ...destinoProceso,
          }
        : null,
      despachoCanal: dc
        ? {
            dcNumber: dc.canalDispatchOrder.dcNumber,
            tipo: dc.canalDispatchOrder.tipo,
            status: dc.canalDispatchOrder.status,
            cliente: dc.canalDispatchOrder.cliente.concepto,
            processDate: dia(dc.canalDispatchOrder.processDate),
            cavaOrigen: dc.cavaOrigen,
            pesoCalienteKg: Number(dc.pesoCalienteKg),
            despachoKg: num(dc.despachoKg),
            pistoleadaAt: dc.createdAt.toISOString(),
            operario: quien(dc.createdById),
            clienteNit: dc.canalDispatchOrder.cliente.nit,
            registrationDate: dia(dc.canalDispatchOrder.registrationDate),
            creadaAt: dc.canalDispatchOrder.createdAt.toISOString(),
            creadaPor: quien(dc.canalDispatchOrder.createdById),
            canalesOrden: dc.canalDispatchOrder.items.length,
            kgCalienteOrden: dc.canalDispatchOrder.items.reduce((s, i) => s + Number(i.pesoCalienteKg), 0),
            kgDespachoOrden: dc.canalDispatchOrder.items.reduce((s, i) => s + Number(i.despachoKg ?? 0), 0),
            cerradaAt:
              dc.canalDispatchOrder.status === DispatchOrderStatus.facturado
                ? dc.canalDispatchOrder.updatedAt.toISOString()
                : null,
          }
        : null,
    };
  }

  /**
   * Trazabilidad hacia adelante de una OD a proceso: lo que produjo el desposte conjunto de sus
   * canales (etiquetas de sus OP) y lo que luego se transformó en acondicionamiento.
   */
  private async productosDeOps(ctx: AuthContext, dispatchOrderId: string, opIds: string[], eventoId: string) {
    const [items, etiquetas, ots] = await Promise.all([
      this.prisma.dispatchOrderItem.findMany({
        where: { dispatchOrderId },
        select: { pesoCalienteKg: true, despachoKg: true },
      }),
      this.prisma.rotuladoEtiqueta.findMany({
        where: { plantId: ctx.plantId, productionOrderId: { in: opIds }, deletedAt: null },
        orderBy: [{ product: { codigo: 'asc' } }, { pieza: 'asc' }],
        select: {
          id: true,
          codigo: true,
          pieza: true,
          netoKg: true,
          canastillaId: true,
          product: { select: { codigo: true, nombre: true } },
          tienda: { select: { codigo: true, nombre: true } },
          productionOrder: { select: { opNumber: true } },
          traslado: { select: { transferOrder: { select: { otNumber: true } } } },
          despacho: { select: { canalDispatchOrder: { select: { dcNumber: true, status: true } } } },
          canastilla: {
            select: {
              traslado: { select: { transferOrder: { select: { otNumber: true } } } },
              despacho: { select: { canalDispatchOrder: { select: { dcNumber: true, status: true } } } },
            },
          },
        },
      }),
      this.prisma.transferOrder.findMany({
        where: {
          plantId: ctx.plantId,
          deletedAt: null,
          items: {
            some: {
              OR: [
                { etiqueta: { productionOrderId: { in: opIds } } },
                { canastilla: { productionOrderId: { in: opIds } } },
              ],
            },
          },
        },
        orderBy: { otNumber: 'asc' },
        select: {
          otNumber: true,
          processDate: true,
          items: {
            select: {
              unds: true,
              netoKg: true,
              etiquetaId: true,
              canastillaId: true,
              product: { select: { codigo: true, nombre: true } },
              etiqueta: { select: { productionOrderId: true } },
              canastilla: { select: { productionOrderId: true } },
            },
          },
          conditioningOrders: {
            where: { deletedAt: null },
            orderBy: { ocNumber: 'asc' },
            select: {
              id: true,
              ocNumber: true,
              proceso: true,
              status: true,
              processDate: true,
              etiquetas: {
                where: { deletedAt: null },
                orderBy: [{ product: { codigo: 'asc' } }, { pieza: 'asc' }],
                select: {
                  id: true,
                  codigo: true,
                  pieza: true,
                  netoKg: true,
                  product: { select: { codigo: true, nombre: true } },
                  despacho: { select: { canalDispatchOrder: { select: { dcNumber: true, status: true } } } },
                },
              },
            },
          },
        },
      }),
    ]);

    const ocIds = ots.flatMap((ot) => ot.conditioningOrders.map((oc) => oc.id));
    const despachados = await this.prisma.dispatchProductItem.findMany({
      where: {
        OR: [
          { etiqueta: { productionOrderId: { in: opIds } } },
          { canastilla: { productionOrderId: { in: opIds } } },
          ...(ocIds.length ? [{ acondEtiqueta: { conditioningOrderId: { in: ocIds } } }] : []),
        ],
        canalDispatchOrder: { deletedAt: null },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        codigo: true,
        unds: true,
        netoKg: true,
        createdAt: true,
        createdById: true,
        acondEtiquetaId: true,
        etiquetaId: true,
        canastillaId: true,
        acondEtiqueta: { select: { conditioningOrderId: true } },
        product: { select: { codigo: true, nombre: true } },
        canalDispatchOrder: {
          select: {
            dcNumber: true,
            status: true,
            processDate: true,
            updatedAt: true,
            cliente: { select: { concepto: true } },
          },
        },
      },
    });

    type Fila = { netoKg: Prisma.Decimal; unds?: number; product: { codigo: string; nombre: string } };
    const resumir = (filas: Fila[]) => {
      const m = new Map<string, { codigo: string; nombre: string; piezas: number; kg: number }>();
      for (const f of filas) {
        const g = m.get(f.product.codigo) ?? { codigo: f.product.codigo, nombre: f.product.nombre, piezas: 0, kg: 0 };
        g.piezas += f.unds ?? 1;
        g.kg += Number(f.netoKg);
        m.set(f.product.codigo, g);
      }
      return [...m.values()]
        .map((g) => ({ ...g, kg: Math.round(g.kg * 100) / 100 }))
        .sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }));
    };
    const deEstaOrden = (i: (typeof ots)[number]['items'][number]) =>
      opIds.includes(i.etiqueta?.productionOrderId ?? i.canastilla?.productionOrderId ?? '');

    const canalDe = await this.canalDeEtiquetas(etiquetas.map((x) => x.id));
    const asignado = canalDe.size > 0;
    const etqCanal = new Set(etiquetas.filter((x) => canalDe.get(x.id)?.eventoId === eventoId).map((x) => x.id));
    const canastillasPropias = new Set(
      etiquetas.filter((x) => etqCanal.has(x.id) && x.canastillaId).map((x) => x.canastillaId!),
    );
    const itemDeCanal = (i: { etiquetaId: string | null; canastillaId: string | null }) =>
      (!!i.etiquetaId && etqCanal.has(i.etiquetaId)) || (!!i.canastillaId && canastillasPropias.has(i.canastillaId));
    const ocsDeCanal = new Set(
      ots.filter((ot) => ot.items.some(itemDeCanal)).flatMap((ot) => ot.conditioningOrders.map((oc) => oc.id)),
    );

    const operarios = await this.prisma.appUser.findMany({
      where: { id: { in: [...new Set(despachados.map((d) => d.createdById))] } },
      select: { id: true, fullName: true },
    });
    const porDc = new Map<number, typeof despachados>();
    for (const d of despachados) {
      const lista = porDc.get(d.canalDispatchOrder.dcNumber) ?? [];
      lista.push(d);
      porDc.set(d.canalDispatchOrder.dcNumber, lista);
    }

    return {
      canalesOrden: items.length,
      kgCalienteOrden: items.reduce((s, i) => s + Number(i.pesoCalienteKg), 0),
      kgFrioOrden: items.reduce((s, i) => s + Number(i.despachoKg ?? 0), 0),
      asignacionPorCanal: asignado,
      productos: resumir(etiquetas),
      productosCanal: resumir(etiquetas.filter((x) => etqCanal.has(x.id))),
      etiquetas: etiquetas.map((x) => {
        const dc = x.despacho ?? x.canastilla?.despacho ?? null;
        const ot = x.traslado ?? x.canastilla?.traslado ?? null;
        return {
          id: x.id,
          codigo: x.codigo,
          pieza: x.pieza,
          productoCodigo: x.product.codigo,
          productoNombre: x.product.nombre,
          netoKg: Number(x.netoKg),
          tienda: `${x.tienda.codigo} - ${x.tienda.nombre}`,
          opNumber: x.productionOrder.opNumber,
          dcNumber: dc?.canalDispatchOrder.dcNumber ?? null,
          dcCerrada: dc?.canalDispatchOrder.status === DispatchOrderStatus.facturado,
          otNumber: ot?.transferOrder.otNumber ?? null,
          deEstaCanal: etqCanal.has(x.id),
          piezaEnCanal: canalDe.get(x.id)?.piezaEnCanal ?? null,
        };
      }),
      transformaciones: ots.flatMap((ot) => {
        const propias = ot.items.filter(deEstaOrden);
        const otras = ot.items.filter((i) => !deEstaOrden(i));
        return ot.conditioningOrders.map((oc) => ({
          otNumber: ot.otNumber,
          otProcessDate: ot.processDate.toISOString().slice(0, 10),
          ocNumber: oc.ocNumber,
          proceso: oc.proceso,
          cerrada: oc.status !== DispatchOrderStatus.activo,
          processDate: oc.processDate.toISOString().slice(0, 10),
          entradas: resumir(propias),
          entradasCanal: resumir(ot.items.filter(itemDeCanal)),
          deEstaCanal: ocsDeCanal.has(oc.id),
          // La OT puede mezclar productos de otras órdenes: lo que resultó es del conjunto.
          otrasEntradasKg: Math.round(otras.reduce((s, i) => s + Number(i.netoKg), 0) * 100) / 100,
          productos: resumir(oc.etiquetas),
          etiquetas: oc.etiquetas.map((x) => ({
            id: x.id,
            codigo: x.codigo,
            pieza: x.pieza,
            productoCodigo: x.product.codigo,
            productoNombre: x.product.nombre,
            netoKg: Number(x.netoKg),
            dcNumber: x.despacho?.canalDispatchOrder.dcNumber ?? null,
            dcCerrada: x.despacho?.canalDispatchOrder.status === DispatchOrderStatus.facturado,
          })),
        }));
      }),
      despachos: [...porDc.entries()].map(([dcNumber, lista]) => {
        const dc = lista[0].canalDispatchOrder;
        const cerrada = dc.status === DispatchOrderStatus.facturado;
        return {
          dcNumber,
          cliente: dc.cliente.concepto,
          processDate: dc.processDate.toISOString().slice(0, 10),
          cerrada,
          cerradaAt: cerrada ? dc.updatedAt.toISOString() : null,
          productos: resumir(lista),
          items: lista.map((d) => ({
            codigo: d.codigo,
            productoCodigo: d.product.codigo,
            productoNombre: d.product.nombre,
            unds: d.unds,
            netoKg: Number(d.netoKg),
            origen: d.acondEtiquetaId ? ('acondicionamiento' as const) : ('desposte' as const),
            deEstaCanal: d.acondEtiqueta
              ? ocsDeCanal.has(d.acondEtiqueta.conditioningOrderId)
              : itemDeCanal(d),
            at: d.createdAt.toISOString(),
            operario: operarios.find((u) => u.id === d.createdById)?.fullName ?? '—',
          })),
        };
      }),
    };
  }

  /**
   * Canal de la que salió cada etiqueta de desposte. Las canales se despostan en el mismo orden en
   * que se pistolearon en la OD, y de cada canal salen `piezasPorCanal` piezas del producto
   * (Piezas Desposte del cliente): la etiqueta N del producto en la OP es de la canal ⌊(N-1)/piezas⌋+1.
   */
  private async canalDeEtiquetas(ids: string[]) {
    const res = new Map<
      string,
      {
        piezaId: string;
        eventoId: string;
        posicion: number;
        piezaEnCanal: number;
        piezasPorCanal: number;
        totalCanales: number;
      }
    >();
    if (!ids.length) return res;
    const etqs = await this.prisma.rotuladoEtiqueta.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        productionOrderId: true,
        productId: true,
        productionOrder: { select: { clienteId: true, dispatchOrderId: true } },
      },
    });
    const animalesPorOd = new Map<string, { piezaId: string; eventoId: string }[]>();
    const grupos = new Map<string, typeof etqs>();
    for (const x of etqs) {
      const k = `${x.productionOrderId}|${x.productId}`;
      grupos.set(k, [...(grupos.get(k) ?? []), x]);
    }
    for (const lista of grupos.values()) {
      const { productionOrderId, productId, productionOrder } = lista[0];
      const odId = productionOrder.dispatchOrderId;
      if (!animalesPorOd.has(odId)) {
        const items = await this.prisma.dispatchOrderItem.findMany({
          where: { dispatchOrderId: odId },
          orderBy: { createdAt: 'asc' },
          select: { canalPiezaId: true, canalPieza: { select: { eventoId: true } } },
        });
        // Media canal: las dos piezas del mismo animal cuentan como una sola canal.
        const vistos = new Set<string>();
        const animales: { piezaId: string; eventoId: string }[] = [];
        for (const i of items) {
          if (vistos.has(i.canalPieza.eventoId)) continue;
          vistos.add(i.canalPieza.eventoId);
          animales.push({ piezaId: i.canalPiezaId, eventoId: i.canalPieza.eventoId });
        }
        animalesPorOd.set(odId, animales);
      }
      const animales = animalesPorOd.get(odId)!;
      const [cp, orden] = await Promise.all([
        this.prisma.clienteProducto.findUnique({
          where: { clienteId_productId: { clienteId: productionOrder.clienteId, productId } },
          select: { piezasPorCanal: true },
        }),
        this.prisma.rotuladoEtiqueta.findMany({
          where: { productionOrderId, productId, deletedAt: null },
          orderBy: [{ createdAt: 'asc' }, { pieza: 'asc' }],
          select: { id: true },
        }),
      ]);
      const ppc = cp?.piezasPorCanal ?? 0;
      if (ppc <= 0) continue;
      for (const x of lista) {
        const n = orden.findIndex((o) => o.id === x.id);
        const idx = Math.floor(n / ppc);
        if (n < 0 || idx >= animales.length) continue;
        res.set(x.id, {
          ...animales[idx],
          posicion: idx + 1,
          piezaEnCanal: (n % ppc) + 1,
          piezasPorCanal: ppc,
          totalCanales: animales.length,
        });
      }
    }
    return res;
  }

  /**
   * Hoja de vida de una etiqueta (desposte o acondicionamiento) hacia atrás: etiqueta → OC → OT
   * → etiquetas de origen → OP → OD → canales despostadas (cada una con su propia trazabilidad).
   */
  async trazabilidadEtiqueta(ctx: AuthContext, id: string) {
    const dcInclude = {
      include: { canalDispatchOrder: { select: { dcNumber: true, status: true, updatedAt: true } } },
    } as const;
    const [des, acond] = await Promise.all([
      this.prisma.rotuladoEtiqueta.findFirst({
        where: { id, plantId: ctx.plantId },
        include: {
          product: { select: { codigo: true, nombre: true } },
          tienda: { select: { codigo: true, nombre: true } },
          canastilla: {
            select: {
              numero: true,
              codigo: true,
              netoKg: true,
              cerradaAt: true,
              cerradaById: true,
              traslado: { include: { transferOrder: { select: { otNumber: true } } } },
              despacho: dcInclude,
            },
          },
          traslado: { include: { transferOrder: { select: { otNumber: true } } } },
          despacho: dcInclude,
        },
      }),
      this.prisma.acondicionamientoEtiqueta.findFirst({
        where: { id, plantId: ctx.plantId },
        include: {
          product: { select: { codigo: true, nombre: true } },
          tienda: { select: { codigo: true, nombre: true } },
          despacho: dcInclude,
          conditioningOrder: {
            include: {
              transferOrder: {
                include: {
                  items: {
                    orderBy: { createdAt: 'asc' },
                    include: {
                      product: { select: { codigo: true, nombre: true } },
                      etiqueta: { select: { productionOrderId: true, productionOrder: { select: { opNumber: true } } } },
                      canastilla: {
                        select: {
                          productionOrderId: true,
                          productionOrder: { select: { opNumber: true } },
                          etiquetas: { where: { deletedAt: null }, select: { id: true, codigo: true } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }),
    ]);
    const e = des ?? acond;
    if (!e) throw new NotFoundException('Etiqueta no encontrada.');

    const oc = acond?.conditioningOrder ?? null;
    const etiquetasOrigen: { id: string; codigo: string | null }[] = des
      ? [{ id: des.id, codigo: des.codigo }]
      : (oc?.transferOrder.items ?? []).flatMap((i) =>
          i.etiquetaId ? [{ id: i.etiquetaId, codigo: i.codigo }] : (i.canastilla?.etiquetas ?? []),
        );
    const canalDe = await this.canalDeEtiquetas(etiquetasOrigen.map((x) => x.id));
    const opIds = des
      ? [des.productionOrderId]
      : [
          ...new Set(
            (oc?.transferOrder.items ?? [])
              .map((i) => i.etiqueta?.productionOrderId ?? i.canastilla?.productionOrderId)
              .filter((x): x is string => !!x),
          ),
        ];
    const ops = await this.prisma.productionOrder.findMany({
      where: { id: { in: opIds } },
      orderBy: { opNumber: 'asc' },
      include: {
        dispatchOrder: {
          include: {
            items: {
              orderBy: { createdAt: 'asc' },
              include: {
                canalPieza: {
                  include: {
                    evento: {
                      select: {
                        id: true,
                        sequence: true,
                        canalTipo: true,
                        canalAnimalTipo: true,
                        conCola: true,
                        expendio: true,
                        canalPiezas: { select: { id: true, pieza: true, pesoKg: true, turno: true } },
                        ordenBeneficio: { select: { reference: true, date: true, cliente: true, guias: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    // Proveedor de cada orden de beneficio por su guía en Peso en Camión.
    const obs = ops.flatMap((op) => op.dispatchOrder.items.map((i) => i.canalPieza.evento.ordenBeneficio));
    const guias = [...new Set(obs.flatMap((o) => o.guias.map((g) => g.trim())).filter(Boolean))];
    const camiones = guias.length
      ? await this.prisma.pesoCamion.findMany({
          where: { plantId: ctx.plantId, deletedAt: null, guia: { in: guias } },
          select: { guia: true, date: true, proveedor: true, procedencia: true },
        })
      : [];
    const dia = (d: Date) => d.toISOString().slice(0, 10);
    const camionDe = (o: (typeof obs)[number]) =>
      camiones.find((c) => dia(c.date) === dia(o.date) && o.guias.some((g) => g.trim() === c.guia));

    const despacho = des ? (des.despacho ?? des.canastilla?.despacho ?? null) : acond!.despacho;
    const traslado = des ? (des.traslado ?? des.canastilla?.traslado ?? null) : null;
    const otNumber = traslado?.transferOrder.otNumber ?? null;
    const transformada = otNumber
      ? await this.prisma.conditioningOrder.findFirst({
          where: { plantId: ctx.plantId, deletedAt: null, transferOrder: { otNumber, plantId: ctx.plantId } },
          orderBy: { ocNumber: 'asc' },
          select: { ocNumber: true, status: true, createdAt: true, createdById: true },
        })
      : null;

    const [reimpresiones, movimientosBodega] = await Promise.all([
      des ? this.prisma.rotuladoReimpresion.findMany({
        where: { plantId: ctx.plantId, productionOrderId: des.productionOrderId, etiquetaId: des.id },
        select: { id: true, createdAt: true, userId: true, estacion: true },
      }) : [],
      this.prisma.bodegaTransferItem.findMany({
        where: {
          ...(des ? { etiquetaId: des.id } : { acondEtiquetaId: e.id }),
          bodegaTransfer: { plantId: ctx.plantId },
        },
        select: {
          id: true, createdAt: true,
          bodegaTransfer: { select: {
            tbbNumber: true, createdById: true,
            origenBodega: { select: { nombre: true } },
            destinoBodega: { select: { nombre: true } },
          } },
        },
      }),
    ]);

    const historial: { id: string; accion: string; at: Date; usuarioId: string | null }[] = [
      { id: 'rotulado', accion: des ? 'Etiquetado en desposte' : 'Etiquetado en acondicionamiento', at: e.createdAt, usuarioId: e.createdById },
    ];
    const canastilla = des?.canastilla;
    if (canastilla?.cerradaAt) historial.push({
      id: 'canastilla', accion: `Cierre de canastilla ${canastilla.numero}`, at: canastilla.cerradaAt, usuarioId: canastilla.cerradaById,
    });
    const opDesposte = des ? ops.find((op) => op.id === des.productionOrderId) : undefined;
    if (opDesposte?.cerradaAt) historial.push({
      id: 'cierre-op', accion: `Cierre de OP${opDesposte.opNumber}`, at: opDesposte.cerradaAt, usuarioId: opDesposte.cerradaById,
    });
    if (traslado) historial.push({
      id: 'traslado', accion: `Traslado a proceso · OT${traslado.transferOrder.otNumber}`, at: traslado.createdAt, usuarioId: traslado.createdById,
    });
    if (transformada) historial.push({
      id: 'acondicionamiento', accion: `Creación de orden de acondicionamiento · OC${transformada.ocNumber}`,
      at: transformada.createdAt, usuarioId: transformada.createdById,
    });
    if (despacho) historial.push({
      id: 'despacho', accion: `Registro en despacho · DC${despacho.canalDispatchOrder.dcNumber}`, at: despacho.createdAt, usuarioId: despacho.createdById,
    });
    if (e.deletedAt) historial.push({ id: 'anulacion', accion: 'Anulación de etiqueta', at: e.deletedAt, usuarioId: e.deletedById });
    for (const r of reimpresiones) historial.push({
      id: r.id, accion: r.estacion ? `Reimpresión · ${r.estacion}` : 'Reimpresión de etiqueta', at: r.createdAt, usuarioId: r.userId,
    });
    for (const m of movimientosBodega) {
      const { tbbNumber, origenBodega, destinoBodega, createdById } = m.bodegaTransfer;
      historial.push({ id: m.id, accion: `Traslado entre bodegas · TBB${tbbNumber} · ${origenBodega.nombre} → ${destinoBodega.nombre}`, at: m.createdAt, usuarioId: createdById });
    }

    const ids = new Set<string>([e.createdById]);
    historial.forEach((paso) => { if (paso.usuarioId) ids.add(paso.usuarioId); });
    ops.forEach((op) => ids.add(op.createdById));
    if (oc) ids.add(oc.createdById);
    if (traslado) ids.add(traslado.createdById);
    if (despacho) ids.add(despacho.createdById);
    const usuarios = await this.prisma.appUser.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, fullName: true },
    });
    const nombre = new Map(usuarios.map((u) => [u.id, u.fullName]));
    const quien = (uid: string) => nombre.get(uid) ?? '—';
    const num = (d: { toString(): string } | null | undefined) => (d == null ? null : Number(d));
    const ordenPieza = { canal: 0, cizq: 1, cder: 2 } as const;

    return {
      tipo: des ? ('desposte' as const) : ('acondicionamiento' as const),
      historial: historial.sort((a, b) => a.at.getTime() - b.at.getTime()).map(({ usuarioId, ...paso }) => ({
        ...paso, at: paso.at.toISOString(), operario: usuarioId ? nombre.get(usuarioId) ?? null : null,
      })),
      origenes: etiquetasOrigen.flatMap((x) => {
        const c = canalDe.get(x.id);
        return c ? [{ etiquetaId: x.id, etiquetaCodigo: x.codigo, ...c }] : [];
      }),
      origenesSinCanal: etiquetasOrigen.filter((x) => !canalDe.has(x.id)).length,
      etiqueta: {
        id: e.id,
        codigo: e.codigo,
        productoCodigo: e.product.codigo,
        productoNombre: e.product.nombre,
        pieza: e.pieza,
        netoKg: Number(e.netoKg),
        brutoKg: Number(e.brutoKg),
        taraKg: Number(e.taraKg),
        tienda: `${e.tienda.codigo} - ${e.tienda.nombre}`,
        empaque: e.empaque,
        conservacion: e.conservacion,
        temperatura: e.temperatura,
        fechaSacrificio: dia(e.fechaSacrificio),
        fechaEmpaque: dia(e.fechaEmpaque),
        fechaVencimiento: e.fechaVencimiento ? dia(e.fechaVencimiento) : null,
        ref: e.ref,
        estacion: e.estacion,
        sobrante: des?.sobrante ?? false,
        anulada: !!e.deletedAt,
        canastilla: des?.canastilla
          ? { numero: des.canastilla.numero, codigo: des.canastilla.codigo, netoKg: num(des.canastilla.netoKg) }
          : null,
        operario: quien(e.createdById),
        createdAt: e.createdAt.toISOString(),
      },
      traslado: traslado
        ? {
            otNumber: traslado.transferOrder.otNumber,
            netoKg: Number(traslado.netoKg),
            at: traslado.createdAt.toISOString(),
            operario: quien(traslado.createdById),
            transformadoOc: transformada?.status === DispatchOrderStatus.facturado ? transformada.ocNumber : null,
          }
        : null,
      despacho: despacho
        ? {
            dcNumber: despacho.canalDispatchOrder.dcNumber,
            cerrada: despacho.canalDispatchOrder.status === DispatchOrderStatus.facturado,
            netoKg: Number(despacho.netoKg),
            at: despacho.createdAt.toISOString(),
            operario: quien(despacho.createdById),
          }
        : null,
      acondicionamiento: oc
        ? {
            ocNumber: oc.ocNumber,
            proceso: oc.proceso,
            processDate: dia(oc.processDate),
            status: oc.status,
            creadaPor: quien(oc.createdById),
            otNumber: oc.transferOrder.otNumber,
            otProcessDate: dia(oc.transferOrder.processDate),
            entradas: oc.transferOrder.items.map((i) => ({
              codigo: i.codigo,
              productoCodigo: i.product.codigo,
              productoNombre: i.product.nombre,
              unds: i.unds,
              netoKg: Number(i.netoKg),
              opNumber: i.etiqueta?.productionOrder.opNumber ?? i.canastilla?.productionOrder.opNumber ?? null,
            })),
          }
        : null,
      ordenesProduccion: ops.map((op) => ({
        opNumber: op.opNumber,
        processDate: dia(op.processDate),
        status: op.status,
        creadaPor: quien(op.createdById),
        odNumber: op.dispatchOrder.odNumber,
        odProcessDate: dia(op.dispatchOrder.processDate),
        canales: op.dispatchOrder.items.map((i) => {
          const ev = i.canalPieza.evento;
          const cam = camionDe(ev.ordenBeneficio);
          return {
            piezaId: i.canalPiezaId,
            reference: ev.ordenBeneficio.reference,
            obDate: dia(ev.ordenBeneficio.date),
            cliente: ev.ordenBeneficio.cliente,
            sequence: ev.sequence,
            turno: i.canalPieza.turno,
            canalTipo: ev.canalTipo,
            canalAnimalTipo: ev.canalAnimalTipo,
            pieza: i.canalPieza.pieza,
            pesoCalienteKg: Number(i.pesoCalienteKg),
            pesoFrioKg: num(i.despachoKg),
            proveedor: cam?.proveedor ?? null,
            procedencia: cam?.procedencia ?? null,
            eventoId: ev.id,
            guias: ev.ordenBeneficio.guias,
            conCola: ev.conCola,
            expendio: ev.expendio,
            piezasAnimal: ev.canalPiezas
              .sort((a, b) => ordenPieza[a.pieza] - ordenPieza[b.pieza])
              .map((x) => ({ id: x.id, pieza: x.pieza, pesoKg: Number(x.pesoKg), turno: x.turno })),
          };
        }),
      })),
    };
  }
}
