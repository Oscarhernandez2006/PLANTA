import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CanalPiezaTipo } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthContext } from '../../common/auth/auth-context';
import { plantDateOnly } from '../../common/plant-date';
import { agruparCanales } from '../../common/canales-traslado';
import { SUBPRODUCTO_ITEM_BY_TIPO } from '../subproductos/subproducto-items';
import { consultarListadoInforme, type QueryListadoInforme, type TipoListado } from './listado-informe';

/** Días hacia atrás que abarca el informe desde la fecha elegida. */
const DIAS_INFORME = 60;

function periodoInforme(hasta?: string, desde?: string) {
  const fin = plantDateOnly(hasta);
  const limite = new Date(fin);
  limite.setUTCDate(limite.getUTCDate() - DIAS_INFORME);
  const inicio = desde ? plantDateOnly(desde) : limite;
  if (inicio > fin || inicio < limite) {
    throw new BadRequestException('El rango de fechas del informe no es válido (máximo 60 días de diferencia).');
  }
  return { inicio, fin };
}

/** Producto del catálogo que corresponde a cada pieza de canal (izquierda = con cola, derecha = sin cola). */
const PRODUCTO_POR_PIEZA: Record<CanalPiezaTipo, { codigo: string; nombre: string }> = {
  canal: { codigo: '10001', nombre: 'CANAL COMPLETA DE RES' },
  cizq: { codigo: '10002', nombre: 'MEDIA CANAL CON COLA DE RES' },
  cder: { codigo: '10003', nombre: 'MEDIA CANAL SR DE RES' },
};

const ORDEN_PIEZA: Record<CanalPiezaTipo, number> = { canal: 0, cizq: 1, cder: 2 };
/** Sebo por res para el informe de sacrificio (no se pesa en planta). */
const SEBO_KG_POR_RES = 7;

/** Producto terminado del informe de producción (siempre el mismo). */
const PRODUCTO_TERMINADO = { codigo: '18000', nombre: 'POSTAS DE RES' };

/** Destinos distintos registrados en las piezas de una orden, o null si no hay. */
function destinos(piezas: { destino: string | null }[]) {
  const unicos = [...new Set(piezas.map((p) => p.destino?.trim()).filter(Boolean))];
  return unicos.length ? unicos.join(', ') : null;
}

@Injectable()
export class InformesService {
  constructor(private readonly prisma: PrismaService) {}

  async piezasDesposte(ctx: AuthContext, opNumber: number) {
    const orden = await this.prisma.productionOrder.findFirst({
      where: { plantId: ctx.plantId, opNumber, deletedAt: null },
      select: {
        opNumber: true,
        cliente: { select: { concepto: true, nit: true } },
        etiquetas: {
          where: { deletedAt: null },
          select: {
            codigo: true, pieza: true, netoKg: true, fechaVencimiento: true, canastillaId: true,
            product: { select: { codigo: true, nombre: true } },
            tienda: { select: { codigo: true, nombre: true } },
            canastilla: { select: { numero: true } },
            createdBy: { select: { fullName: true } },
          },
        },
      },
    });
    if (!orden) throw new NotFoundException('Orden de producción no encontrada.');
    return {
      opNumber: orden.opNumber,
      cliente: orden.cliente.concepto,
      nit: orden.cliente.nit,
      piezas: orden.etiquetas.map((e) => ({
        codigoProducto: e.product.codigo,
        nombrePieza: e.product.nombre,
        codigoBarras: e.codigo,
        pieza: e.pieza,
        tienda: `${e.tienda.codigo} - ${e.tienda.nombre}`,
        canastillaId: e.canastillaId,
        canastilla: e.canastilla?.numero ?? null,
        etiquetadoPor: e.createdBy.fullName,
        pesoKg: Number(e.netoKg),
        lote: `OP${orden.opNumber}`,
        vence: e.fechaVencimiento?.toISOString().slice(0, 10) ?? null,
      })),
    };
  }

  listado(ctx: AuthContext, tipo: TipoListado, query: QueryListadoInforme, exportar = false) {
    const { inicio, fin } = periodoInforme(query.hasta, query.desde);
    return consultarListadoInforme(this.prisma, ctx.plantId, tipo, query, inicio, fin, exportar);
  }

  /** 01.7 CANAL/CALIENTE: órdenes con canales pesadas, de la más reciente a la más antigua. */
  async canalCaliente(ctx: AuthContext, hasta?: string, desde?: string) {
    const { inicio, fin } = periodoInforme(hasta, desde);

    const ordenes = await this.prisma.ordenBeneficio.findMany({
      where: {
        plantId: ctx.plantId,
        deletedAt: null,
        date: { gte: inicio, lte: fin },
        eventos: { some: { canalPiezas: { some: {} } } },
      },
      select: {
        id: true,
        reference: true,
        cliente: true,
        date: true,
        status: true,
        eventos: { select: { canalPiezas: { select: { destino: true, pesoKg: true } } } },
      },
      orderBy: [{ date: 'desc' }, { reference: 'desc' }],
    });
    return ordenes.map(({ eventos, ...o }) => ({
      ...o,
      date: o.date.toISOString().slice(0, 10),
      destino: destinos(eventos.flatMap((e) => e.canalPiezas)),
      pesoTotalKg: eventos.reduce((total, e) => total + e.canalPiezas.reduce((kg, p) => kg + Number(p.pesoKg), 0), 0),
    }));
  }

  /** Detalle de una orden: cada pieza de canal pesada con su producto y peso. */
  async canalCalienteDetalle(ctx: AuthContext, ordenId: string) {
    const orden = await this.prisma.ordenBeneficio.findFirst({
      where: { id: ordenId, plantId: ctx.plantId, deletedAt: null },
      select: {
        id: true,
        reference: true,
        cliente: true,
        date: true,
        guias: true,
        eventos: {
          select: {
            sequence: true,
            stunnedAt: true,
            canalTipo: true,
            canalAnimalTipo: true,
            canalPiezas: {
              select: {
                id: true,
                pieza: true,
                turno: true,
                pesoKg: true,
                destino: true,
                observaciones: true,
                cava: true,
                weighedAt: true,
                operatorId: true,
              },
            },
          },
        },
      },
    });
    if (!orden) throw new NotFoundException('Orden no encontrada.');

    // Peso vivo vigente (repesado si lo hubo) de cada animal y datos de las guías.
    const [vivos, camiones, operarios] = await Promise.all([
      this.prisma.pesoEnPie.findMany({
        where: { ordenBeneficioId: orden.id, deletedAt: null },
        select: { ordenSequence: true, pesoTotalKg: true },
      }),
      this.prisma.pesoCamion.findMany({
        where: { plantId: ctx.plantId, deletedAt: null, guia: { in: orden.guias } },
        select: { referenciaLote: true, procedencia: true, proveedor: true },
      }),
      this.prisma.appUser.findMany({
        where: {
          id: { in: [...new Set(orden.eventos.flatMap((e) => e.canalPiezas.map((p) => p.operatorId)))] },
        },
        select: { id: true, fullName: true },
      }),
    ]);
    const vivoPorSeq = new Map(vivos.map((v) => [v.ordenSequence, Number(v.pesoTotalKg ?? 0)]));
    const nombreOperario = new Map(operarios.map((u) => [u.id, u.fullName]));
    const unicos = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x?.trim()))];
    const horas = orden.eventos.map((e) => e.stunnedAt.getTime()).sort((a, b) => a - b);

    // Nombres vigentes del catálogo (si existen); si no, los por defecto.
    const productos = await this.prisma.product.findMany({
      where: {
        plantId: ctx.plantId,
        codigo: { in: Object.values(PRODUCTO_POR_PIEZA).map((p) => p.codigo) },
      },
      select: { codigo: true, nombre: true },
    });
    const nombrePorCodigo = new Map(productos.map((p) => [p.codigo, p.nombre]));
    const cliente = await this.prisma.cliente.findUnique({
      where: { concepto: orden.cliente },
      select: { nit: true, direccion: true, ciudad: true },
    });

    const piezas = orden.eventos
      .flatMap((e) =>
        e.canalPiezas.map((p) => {
          const prod = PRODUCTO_POR_PIEZA[p.pieza];
          return {
            piezaId: p.id,
            sequence: e.sequence,
            turno: p.turno,
            pieza: p.pieza,
            canalTipo: e.canalTipo,
            canalAnimalTipo: e.canalAnimalTipo,
            observaciones: p.observaciones,
            codigo: prod.codigo,
            producto: nombrePorCodigo.get(prod.codigo) ?? prod.nombre,
            pesoKg: Number(p.pesoKg),
            vivoKg: vivoPorSeq.get(e.sequence) ?? null,
            cava: p.cava,
            weighedAt: p.weighedAt.toISOString(),
            operario: nombreOperario.get(p.operatorId) ?? null,
          };
        }),
      )
      .sort(
        (a, b) =>
          (a.turno ?? a.sequence) - (b.turno ?? b.sequence) ||
          ORDEN_PIEZA[a.pieza] - ORDEN_PIEZA[b.pieza],
      );

    return {
      id: orden.id,
      reference: orden.reference,
      cliente: orden.cliente,
      clienteNit: cliente?.nit ?? null,
      clienteDireccion: cliente?.direccion ?? null,
      clienteCiudad: cliente?.ciudad ?? null,
      destino: destinos(orden.eventos.flatMap((e) => e.canalPiezas)),
      date: orden.date.toISOString().slice(0, 10),
      guias: orden.guias,
      lotes: unicos(camiones.map((c) => c.referenciaLote)),
      procedencias: unicos(camiones.map((c) => c.procedencia)),
      proveedores: unicos(camiones.map((c) => c.proveedor)),
      sacrificioDesde: horas.length ? new Date(horas[0]).toISOString() : null,
      sacrificioHasta: horas.length ? new Date(horas[horas.length - 1]).toISOString() : null,
      piezas,
    };
  }

  /** Informe de producción: órdenes de producción de los últimos días hasta `hasta`. */
  async produccion(ctx: AuthContext, hasta?: string, desde?: string) {
    const { inicio, fin } = periodoInforme(hasta, desde);
    const ordenes = await this.prisma.productionOrder.findMany({
      // Registrada o con proceso en el periodo (la fecha de proceso puede ser futura).
      where: {
        plantId: ctx.plantId,
        deletedAt: null,
        OR: [
          { registrationDate: { gte: inicio, lte: fin } },
          { processDate: { gte: inicio, lte: fin } },
        ],
      },
      select: {
        id: true,
        opNumber: true,
        processDate: true,
        status: true,
        cliente: { select: { id: true, concepto: true, nit: true } },
        dispatchOrder: { select: { odNumber: true } },
      },
      orderBy: [{ processDate: 'desc' }, { opNumber: 'desc' }],
    });
    return ordenes.map((o) => ({
      id: o.id,
      opNumber: o.opNumber,
      odNumber: o.dispatchOrder.odNumber,
      clienteId: o.cliente.id,
      cliente: o.cliente.concepto,
      clienteNit: o.cliente.nit,
      processDate: o.processDate.toISOString().slice(0, 10),
      status: o.status,
    }));
  }

  /**
   * Detalle: lo que se usa de las canales en frío. Sale de las canales pesadas
   * en Canal Fría sobre la orden de despacho (traslado de M.P. a sala) ligada a la OP.
   */
  async produccionDetalle(ctx: AuthContext, opId: string) {
    const op = await this.prisma.productionOrder.findFirst({
      where: { id: opId, plantId: ctx.plantId, deletedAt: null },
      select: {
        id: true,
        opNumber: true,
        processDate: true,
        status: true,
        updatedAt: true,
        cerradaAt: true,
        cerradaById: true,
        cliente: { select: { id: true, concepto: true, nit: true } },
        dispatchOrder: {
          select: {
            odNumber: true,
            items: {
              select: {
                pesoCalienteKg: true,
                despachoKg: true,
                createdAt: true,
                canalPieza: {
                  select: {
                    pieza: true,
                    eventoId: true,
                    evento: { select: { ordenBeneficio: { select: { date: true, reference: true, guias: true } } } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!op) throw new NotFoundException('Orden de producción no encontrada.');

    const items = op.dispatchOrder.items;
    const productos = await this.prisma.product.findMany({
      where: {
        plantId: ctx.plantId,
        codigo: {
          in: [...Object.values(PRODUCTO_POR_PIEZA).map((p) => p.codigo), PRODUCTO_TERMINADO.codigo],
        },
      },
      select: { codigo: true, nombre: true },
    });
    const nombrePorCodigo = new Map(productos.map((p) => [p.codigo, p.nombre]));

    // Canal completa, medias izq + der del mismo animal juntas, y mitades sueltas.
    const g = agruparCanales(
      items.map((i) => ({
        pieza: i.canalPieza.pieza,
        eventoId: i.canalPieza.eventoId,
        // Peso en frío si ya se pesó en Canal Fría; si no, el de caliente.
        kg: Number(i.despachoKg ?? i.pesoCalienteKg),
      })),
    );
    const nombre = (tipo: CanalPiezaTipo) =>
      nombrePorCodigo.get(PRODUCTO_POR_PIEZA[tipo].codigo) ?? PRODUCTO_POR_PIEZA[tipo].nombre;
    const detalle = [
      { codigo: PRODUCTO_POR_PIEZA.canal.codigo, producto: nombre('canal'), grupo: g.completas },
      {
        codigo: `${PRODUCTO_POR_PIEZA.cizq.codigo} + ${PRODUCTO_POR_PIEZA.cder.codigo}`,
        producto: `${nombre('cizq')} + ${nombre('cder')}`,
        grupo: g.pares,
      },
      { codigo: PRODUCTO_POR_PIEZA.cizq.codigo, producto: nombre('cizq'), grupo: g.sueltasIzq },
      { codigo: PRODUCTO_POR_PIEZA.cder.codigo, producto: nombre('cder'), grupo: g.sueltasDer },
    ]
      .filter((r) => r.grupo.canales > 0)
      .map((r) => ({
        codigo: r.codigo,
        producto: r.producto,
        piezas: r.grupo.canales,
        kg: Number(r.grupo.kg.toFixed(2)),
      }));

    const dia = (d: Date) => d.toISOString().slice(0, 10);
    const diaPlanta = (d: Date) =>
      new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(d);
    const sacrificios = items.map((i) => dia(i.canalPieza.evento.ordenBeneficio.date)).sort();
    const ingresos = items.map((i) => diaPlanta(i.createdAt)).sort();

    // Pesaje y etiquetado: una fila consolidada por producto + tienda, con el total de
    // canastillas usadas. El detalle se despliega empaque por empaque (cada etiqueta).
    const etiquetas = await this.prisma.rotuladoEtiqueta.findMany({
      where: { productionOrderId: op.id, deletedAt: null },
      orderBy: { pieza: 'asc' },
      select: {
        pieza: true,
        codigo: true,
        netoKg: true,
        empaque: true,
        sobrante: true,
        impresa: true,
        estacion: true,
        canastillaId: true,
        createdAt: true,
        product: { select: { id: true, codigo: true, nombre: true, categoria: true } },
        tienda: { select: { codigo: true, nombre: true } },
        canastilla: { select: { numero: true } },
      },
    });
    // Tipo del producto para el cliente (conservación); si no, por la categoría.
    const tiposCliente = await this.prisma.clienteProducto.findMany({
      where: { clienteId: op.cliente.id, productId: { in: [...new Set(etiquetas.map((e) => e.product.id))] } },
      select: { productId: true, tipo: true },
    });
    const tipoPorProducto = new Map(tiposCliente.map((t) => [t.productId, t.tipo]));
    const tipoDe = (p: { id: string; categoria: string | null }) =>
      tipoPorProducto.get(p.id) ??
      (p.categoria === 'PRODUCTO EN PROCESO'
        ? 'EN PROCESO'
        : p.categoria === 'RES SUBPRODUCTOS'
          ? 'SUBPRODUCTO'
          : p.categoria === 'RES PRODUCTOS TERMINADOS'
            ? 'TERMINADO'
            : 'MATERIA PRIMA');
    const borradas = await this.prisma.rotuladoEtiqueta.count({
      where: { productionOrderId: op.id, deletedAt: { not: null } },
    });
    const reimpresiones = await this.prisma.rotuladoReimpresion.count({
      where: { productionOrderId: op.id },
    });
    const cerradaPor = op.cerradaById
      ? ((await this.prisma.appUser.findUnique({ where: { id: op.cerradaById }, select: { fullName: true } }))
          ?.fullName ?? null)
      : null;
    // El rendimiento se calcula contra los kilos de materia prima (canales en frío).
    const kgMateriaPrima = detalle.reduce((a, r) => a + r.kg, 0);
    const rnd = (kgp: number) =>
      kgMateriaPrima > 0 ? Number(((kgp / kgMateriaPrima) * 100).toFixed(2)) : 0;
    type Empaque = {
      pieza: number;
      canastillaId: string | null;
      canastilla: number | null;
      empaque: string;
      sobrante: boolean;
      kg: number;
      createdAt: Date;
    };
    const porProducto = new Map<
      string,
      {
        codigo: string;
        producto: string;
        tipo: string;
        tiendaCodigo: string;
        tienda: string;
        unds: number;
        sobrantes: number;
        kg: number;
        canastillasSet: Set<string>;
        // Detalle: cada empaque/pieza etiquetada (al vacío va por pieza; a granel, la caja entera).
        empaques: Empaque[];
      }
    >();
    for (const e of etiquetas) {
      const clave = `${e.product.codigo}:${e.tienda.codigo}`;
      const fila = porProducto.get(clave) ?? {
        codigo: e.product.codigo,
        producto: e.product.nombre,
        tipo: tipoDe(e.product),
        tiendaCodigo: e.tienda.codigo,
        tienda: e.tienda.nombre,
        unds: 0,
        sobrantes: 0,
        kg: 0,
        canastillasSet: new Set<string>(),
        empaques: [],
      };
      fila.unds += 1;
      if (e.sobrante) fila.sobrantes += 1;
      fila.kg += Number(e.netoKg);
      if (e.canastillaId) fila.canastillasSet.add(e.canastillaId);
      fila.empaques.push({
        pieza: e.pieza,
        canastillaId: e.canastillaId,
        canastilla: e.canastilla?.numero ?? null,
        empaque: e.empaque,
        sobrante: e.sobrante,
        kg: Number(e.netoKg),
        createdAt: e.createdAt,
      });
      porProducto.set(clave, fila);
    }
    const etiquetado = [...porProducto.values()]
      .sort(
        (a, b) =>
          a.codigo.localeCompare(b.codigo, 'es', { numeric: true }) ||
          a.tiendaCodigo.localeCompare(b.tiendaCodigo, 'es', { numeric: true }),
      )
      .map(({ canastillasSet, empaques, ...f }) => {
        // Detalle por canastilla: cuántas canastillas (1 por fila), sus unidades y kilos.
        const grupos = new Map<string, Empaque[]>();
        for (const x of empaques) {
          const k = x.canastillaId ?? `pieza-${x.pieza}`;
          grupos.set(k, [...(grupos.get(k) ?? []), x]);
        }
        const detalle = [...grupos.values()]
          .sort(
            (a, b) =>
              Math.min(...a.map((x) => x.createdAt.getTime())) -
                Math.min(...b.map((x) => x.createdAt.getTime())) ||
              Math.min(...a.map((x) => x.pieza)) - Math.min(...b.map((x) => x.pieza)),
          )
          .map((g) => {
            const piezas = g.map((x) => x.pieza).sort((a, b) => a - b);
            const kgG = g.reduce((s, x) => s + x.kg, 0);
            return {
              canastilla: g[0].canastilla,
              canastillas: g[0].canastillaId ? 1 : 0,
              unds: g.length,
              piezaDesde: piezas[0],
              piezaHasta: piezas[piezas.length - 1],
              empaque: g[0].empaque,
              sobrantes: g.filter((x) => x.sobrante).length,
              kg: Number(kgG.toFixed(2)),
              rendimiento: rnd(kgG),
            };
          });
        return {
          ...f,
          canastillas: canastillasSet.size,
          kg: Number(f.kg.toFixed(2)),
          rendimiento: rnd(f.kg),
          detalle,
        };
      });

    return {
      id: op.id,
      opNumber: op.opNumber,
      odNumber: op.dispatchOrder.odNumber,
      clienteId: op.cliente.id,
      cliente: op.cliente.concepto,
      clienteNit: op.cliente.nit,
      productoTerminado:
        nombrePorCodigo.get(PRODUCTO_TERMINADO.codigo) ?? PRODUCTO_TERMINADO.nombre,
      fechaSacrificio: sacrificios[0] ?? null,
      fechaIngreso: ingresos[0] ?? null,
      processDate: dia(op.processDate),
      status: op.status,
      // Órdenes cerradas antes de guardar la fecha de cierre: se usa su última actualización.
      cerradaAt: op.cerradaAt?.toISOString() ?? (op.status === 'facturado' ? op.updatedAt.toISOString() : null),
      cerradaPor,
      canales: new Set(items.map((i) => i.canalPieza.eventoId)).size,
      obReferencias: [
        ...new Set(items.map((i) => i.canalPieza.evento.ordenBeneficio.reference)),
      ].sort((a, b) => a - b),
      guias: [
        ...new Set(items.flatMap((i) => i.canalPieza.evento.ordenBeneficio.guias.map((g) => g.trim()))),
      ].filter(Boolean),
      control: {
        noImpresas: etiquetas.filter((e) => !e.impresa).length,
        sobrantes: etiquetas.filter((e) => e.sobrante).length,
        borradas,
        reimpresiones,
        estaciones: [...new Set(etiquetas.map((e) => e.estacion).filter((x): x is string => !!x))],
      },
      detalle,
      etiquetado,
    };
  }
  // ===================== Informe de sacrificio =====================

  /** INFORME DE SACRIFICIO: órdenes con animales sacrificados, de la más reciente a la más antigua. */
  async sacrificio(ctx: AuthContext, hasta?: string, desde?: string) {
    const { inicio, fin } = periodoInforme(hasta, desde);
    const ordenes = await this.prisma.ordenBeneficio.findMany({
      where: {
        plantId: ctx.plantId,
        deletedAt: null,
        date: { gte: inicio, lte: fin },
        eventos: { some: {} },
      },
      select: {
        id: true,
        reference: true,
        cliente: true,
        date: true,
        status: true,
        guias: true,
        animalCount: true,
        _count: { select: { eventos: true } },
      },
      orderBy: [{ date: 'desc' }, { reference: 'desc' }],
    });
    return ordenes.map(({ _count, ...o }) => ({
      ...o,
      date: o.date.toISOString().slice(0, 10),
      sacrificados: _count.eventos,
    }));
  }

  /**
   * REPORTE BENEFICIO DE ANIMALES de una orden: guías con su proveedor y
   * procedencia, y por animal la guía, la referencia del ganado/finca, el
   * tipo, el código del precinto, el turno, PEP, PEC, piel, rendimiento y la
   * logística de Canal Caliente (observación, cava y destino). El PEP es el
   * peso individual del animal en Peso en Pie: el animal N de la orden es el N
   * de su guía; si la guía se repartió en varias órdenes del día, se desplaza
   * por los animales de las órdenes anteriores de esa guía.
   */
  async sacrificioDetalle(ctx: AuthContext, ordenId: string) {
    const orden = await this.prisma.ordenBeneficio.findFirst({
      where: { id: ordenId, plantId: ctx.plantId, deletedAt: null },
      select: {
        id: true,
        reference: true,
        cliente: true,
        date: true,
        status: true,
        guias: true,
        animalCount: true,
        eventos: {
          orderBy: { sequence: 'asc' },
          select: {
            sequence: true,
            stunnedAt: true,
            pesoPielKg: true,
            canalAnimalTipo: true,
            canalTipo: true,
            conCola: true,
            canalPiezas: {
              select: {
                pieza: true,
                pesoKg: true,
                turno: true,
                cava: true,
                destino: true,
                observaciones: true,
                // Peso en frío = peso de despacho (OD a proceso o DC frío/caliente), si ya se pesó.
                despacho: { select: { despachoKg: true } },
                despachoCanal: { select: { despachoKg: true } },
              },
            },
          },
        },
      },
    });
    if (!orden) throw new NotFoundException('Orden no encontrada.');

    const guias = orden.guias.map((g) => g.trim()).filter(Boolean);
    // Solo se cruza animal por animal con Peso en Pie si la orden tiene una única guía.
    const guia = guias.length === 1 ? guias[0] : null;
    const [previas, animalesPie, camiones, delDia, cliente] = await Promise.all([
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
      guia
        ? this.prisma.pesoEnPie.findMany({
            where: { plantId: ctx.plantId, deletedAt: null, date: orden.date, guia },
            select: {
              reference: true,
              guia: true,
              pesoTotalKg: true,
              tipoAnimal: true,
              procedencia: true,
              ordenBeneficioId: true,
              ordenSequence: true,
            },
          })
        : // Varias guías: solo los animales asignados a esta orden.
          this.prisma.pesoEnPie.findMany({
            where: { plantId: ctx.plantId, deletedAt: null, ordenBeneficioId: orden.id },
            select: {
              reference: true,
              guia: true,
              pesoTotalKg: true,
              tipoAnimal: true,
              procedencia: true,
              ordenBeneficioId: true,
              ordenSequence: true,
            },
          }),
      guias.length
        ? this.prisma.pesoCamion.findMany({
            where: { plantId: ctx.plantId, deletedAt: null, guia: { in: guias } },
            orderBy: { reference: 'asc' },
            select: { guia: true, proveedor: true, procedencia: true, referenciaLote: true },
          })
        : [],
      // Consecutivo (turno) del día: animales de las órdenes previas del mismo día.
      this.prisma.ordenBeneficio.findMany({
        where: { plantId: ctx.plantId, deletedAt: null, date: orden.date },
        orderBy: { reference: 'asc' },
        select: { id: true, animalCount: true },
      }),
      this.prisma.cliente.findUnique({
        where: { concepto: orden.cliente },
        select: { nit: true },
      }),
    ]);

    // Código de proveedor (NIT) y de procedencia (RSPP) para el bloque de guías.
    const nombresProveedor = [...new Set(camiones.map((c) => c.proveedor).filter((x): x is string => !!x))];
    const nombresProcedencia = [...new Set(camiones.map((c) => c.procedencia).filter((x): x is string => !!x))];
    const [proveedores, procedencias] = await Promise.all([
      nombresProveedor.length
        ? this.prisma.proveedor.findMany({
            where: { concepto: { in: nombresProveedor } },
            select: { concepto: true, nit: true, code: true },
          })
        : [],
      nombresProcedencia.length
        ? this.prisma.procedencia.findMany({
            where: { concepto: { in: nombresProcedencia } },
            select: { concepto: true, rspp: true, nit: true, code: true },
          })
        : [],
    ]);
    const codProveedor = new Map(proveedores.map((p) => [p.concepto, p.nit || String(p.code)]));
    const codProcedencia = new Map(procedencias.map((p) => [p.concepto, p.rspp || p.nit || String(p.code)]));
    const conCodigo = (nombre: string | null, codigo?: string) =>
      nombre ? (codigo ? `${codigo} - ${nombre}` : nombre) : null;
    const camionPorGuia = new Map(camiones.map((c) => [c.guia?.trim() ?? '', c]));
    const guiasDetalle = guias.map((g) => {
      const c = camionPorGuia.get(g);
      return {
        guia: g,
        referencia: c?.referenciaLote ?? null,
        proveedor: conCodigo(c?.proveedor ?? null, c?.proveedor ? codProveedor.get(c.proveedor) : undefined),
        procedencia: conCodigo(
          c?.procedencia ?? null,
          c?.procedencia ? codProcedencia.get(c.procedencia) : undefined,
        ),
      };
    });

    const desfase = previas?._sum.animalCount ?? 0;
    const piePorReferencia = new Map(animalesPie.map((a) => [a.reference, a]));
    // Animales asignados explícitamente a la orden; si no hay (órdenes
    // antiguas), se resuelve por posición dentro de la guía.
    const piePorSecuencia = new Map(
      animalesPie
        .filter((a) => a.ordenBeneficioId === orden.id && a.ordenSequence != null)
        .map((a) => [a.ordenSequence as number, a]),
    );
    const pieDeSecuencia = (seq: number) =>
      piePorSecuencia.size ? piePorSecuencia.get(seq) : piePorReferencia.get(desfase + seq);
    let base = 0;
    for (const o of delDia) {
      if (o.id === orden.id) break;
      base += o.animalCount;
    }
    const finca = camiones[0]?.procedencia ?? animalesPie[0]?.procedencia ?? null;
    const r1 = (n: number) => Math.round(n * 100) / 100;
    const unicos = (vals: (string | null)[]) =>
      [...new Set(vals.map((v) => v?.trim()).filter(Boolean))].join(' / ') || null;

    const animales = orden.eventos.map((e) => {
      const pie = pieDeSecuencia(e.sequence);
      const pepKg = pie?.pesoTotalKg == null ? null : Number(pie.pesoTotalKg);
      const piezas = [...e.canalPiezas].sort((a, b) => ORDEN_PIEZA[a.pieza] - ORDEN_PIEZA[b.pieza]);
      const pecKg = piezas.length ? r1(piezas.reduce((s, p) => s + Number(p.pesoKg), 0)) : null;
      // Peso en frío: suma de los pesos de despacho de las piezas que ya se despacharon.
      const piezasFrio = piezas.filter(
        (p) => p.despacho?.despachoKg != null || p.despachoCanal?.despachoKg != null,
      );
      const pecfKg = piezasFrio.length
        ? r1(
            piezasFrio.reduce(
              (s, p) => s + Number(p.despacho?.despachoKg ?? p.despachoCanal?.despachoKg ?? 0),
              0,
            ),
          )
        : null;
      const turno = base + e.sequence;
      return {
        sequence: e.sequence,
        turno,
        // Gancho = lote de la orden + turno del día (p. ej. 3-29).
        gancho: `${orden.reference}-${turno}`,
        guia: guia ?? pie?.guia ?? (guias.join(', ') || null),
        referencia: camionPorGuia.get(guia ?? pie?.guia ?? '')?.referenciaLote ?? null,
        tipo: e.canalAnimalTipo?.toUpperCase() ?? pie?.tipoAnimal ?? null,
        canalAnimalTipo: e.canalAnimalTipo,
        canalTipo: e.canalTipo,
        piezas: piezas.map((p) => ({ pieza: p.pieza, turno: p.turno })),
        stunnedAt: e.stunnedAt.toISOString(),
        pepKg,
        pecKg,
        pecfKg,
        pielKg: e.pesoPielKg == null ? null : Number(e.pesoPielKg),
        rendimiento: pepKg && pecKg != null ? r1((pecKg / pepKg) * 100) : null,
        // Merma de frío: lo que perdió la canal entre caliente y despacho.
        mermaFrioKg: pecKg != null && pecfKg != null ? r1(pecKg - pecfKg) : null,
        observacion: unicos(piezas.map((p) => p.observaciones)),
        ubicacion: unicos(piezas.map((p) => p.cava)),
        destino: unicos(piezas.map((p) => p.destino)),
      };
    });

    const suma = (k: 'pepKg' | 'pecKg' | 'pecfKg' | 'pielKg') =>
      r1(animales.reduce((s, a) => s + (a[k] ?? 0), 0));
    // El rendimiento total solo cuenta animales con PEP y PEC.
    const conAmbos = animales.filter((a) => a.pepKg && a.pecKg != null);
    const pepAmbos = conAmbos.reduce((s, a) => s + a.pepKg!, 0);
    const pecAmbos = conAmbos.reduce((s, a) => s + a.pecKg!, 0);
    const pecKg = suma('pecKg');

    return {
      id: orden.id,
      reference: orden.reference,
      date: orden.date.toISOString().slice(0, 10),
      status: orden.status,
      cliente: orden.cliente,
      clienteNit: cliente?.nit ?? null,
      guias: orden.guias,
      guiasDetalle,
      finca,
      animalCount: orden.animalCount,
      animales,
      totales: {
        animales: animales.length,
        pepKg: suma('pepKg'),
        pecKg,
        pecfKg: suma('pecfKg'),
        pielKg: suma('pielKg'),
        // No se pesa en planta: 7 kg por res, como en la hoja de retomas.
        seboKg: animales.length * SEBO_KG_POR_RES,
        promedioKg: animales.length ? r1(pecKg / animales.length) : null,
        rendimiento: pepAmbos > 0 ? r1((pecAmbos / pepAmbos) * 100) : null,
      },
    };
  }
  // ===================== Informe de proceso general =====================

  /** Órdenes de beneficio del periodo (todas, con o sin animales sacrificados). */
  async procesoGeneral(ctx: AuthContext, hasta?: string, desde?: string) {
    const { inicio, fin } = periodoInforme(hasta, desde);
    const ordenes = await this.prisma.ordenBeneficio.findMany({
      where: { plantId: ctx.plantId, deletedAt: null, date: { gte: inicio, lte: fin } },
      select: {
        id: true,
        reference: true,
        cliente: true,
        date: true,
        status: true,
        guias: true,
        animalCount: true,
        _count: { select: { eventos: true } },
      },
      orderBy: [{ date: 'desc' }, { reference: 'desc' }],
    });
    return ordenes.map(({ _count, ...o }) => ({
      ...o,
      date: o.date.toISOString().slice(0, 10),
      sacrificados: _count.eventos,
    }));
  }

  /**
   * Trazabilidad completa de una orden de beneficio: guía (Peso en Camión),
   * Peso en Pie (con repesajes), Sacrificio, Pieles, Canal Caliente (piezas,
   * cava, destino y despacho) y Subproductos. El animal N de la orden se cruza
   * con el N de su guía en Peso en Pie (desplazado si la guía se repartió en
   * varias órdenes del día), igual que el informe de sacrificio.
   */
  async procesoGeneralDetalle(ctx: AuthContext, ordenId: string) {
    const orden = await this.prisma.ordenBeneficio.findFirst({
      where: { id: ordenId, plantId: ctx.plantId, deletedAt: null },
      include: {
        eventos: {
          orderBy: { sequence: 'asc' },
          include: {
            canalPiezas: {
              include: {
                despacho: { select: { dispatchOrder: { select: { odNumber: true } } } },
                despachoCanal: { select: { canalDispatchOrder: { select: { dcNumber: true, tipo: true } } } },
                _count: { select: { trasladosCava: true } },
              },
            },
            subproductos: true,
          },
        },
      },
    });
    if (!orden) throw new NotFoundException('Orden no encontrada.');

    const guia = orden.guias.length === 1 ? orden.guias[0].trim() : null;
    const [camiones, animalesPie, previas, delDia, cliente] = await Promise.all([
      this.prisma.pesoCamion.findMany({
        where: {
          plantId: ctx.plantId,
          deletedAt: null,
          date: orden.date,
          guia: { in: orden.guias.map((g) => g.trim()) },
        },
        orderBy: { reference: 'asc' },
      }),
      guia
        ? this.prisma.pesoEnPie.findMany({
            where: { plantId: ctx.plantId, deletedAt: null, date: orden.date, guia },
            include: { repesajes: { orderBy: { ronda: 'asc' } } },
            orderBy: { reference: 'asc' },
          })
        : this.prisma.pesoEnPie.findMany({
            where: { plantId: ctx.plantId, deletedAt: null, ordenBeneficioId: orden.id },
            include: { repesajes: { orderBy: { ronda: 'asc' } } },
            orderBy: { ordenSequence: 'asc' },
          }),
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
      this.prisma.ordenBeneficio.findMany({
        where: { plantId: ctx.plantId, deletedAt: null, date: orden.date },
        orderBy: { reference: 'asc' },
        select: { id: true, animalCount: true },
      }),
      this.prisma.cliente.findUnique({ where: { concepto: orden.cliente }, select: { nit: true } }),
    ]);

    // Nombres de todos los usuarios que intervinieron.
    const ids = new Set<string>([orden.createdById]);
    if (orden.subproductoRetiroById) ids.add(orden.subproductoRetiroById);
    for (const e of orden.eventos) {
      ids.add(e.operatorId);
      if (e.pielOperatorId) ids.add(e.pielOperatorId);
      e.canalPiezas.forEach((p) => ids.add(p.operatorId));
      e.subproductos.forEach((sp) => sp.operatorId && ids.add(sp.operatorId));
    }
    for (const a of animalesPie) {
      ids.add(a.createdById);
      a.repesajes.forEach((r) => ids.add(r.operatorId));
    }
    for (const c of camiones) ids.add(c.createdById);
    const usuarios = await this.prisma.appUser.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, fullName: true },
    });
    const nombre = new Map(usuarios.map((u) => [u.id, u.fullName]));
    const quien = (id: string | null | undefined) => (id ? nombre.get(id) ?? '—' : null);

    const r2 = (n: number) => Math.round(n * 100) / 100;
    const n = (d: { toString(): string } | null | undefined) => (d == null ? null : Number(d));
    const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

    let base = 0;
    for (const o of delDia) {
      if (o.id === orden.id) break;
      base += o.animalCount;
    }
    const desfase = previas?._sum.animalCount ?? 0;
    const piePorReferencia = new Map(animalesPie.map((a) => [a.reference, a]));
    const piePorSecuencia = new Map(
      animalesPie
        .filter((a) => a.ordenBeneficioId === orden.id && a.ordenSequence != null)
        .map((a) => [a.ordenSequence as number, a]),
    );
    const pieDeSecuencia = (seq: number) =>
      piePorSecuencia.size ? piePorSecuencia.get(seq) : piePorReferencia.get(desfase + seq);
    const pesosPie = (a: (typeof animalesPie)[number]) => {
      const actual = n(a.pesoTotalKg) ?? 0;
      const inicial = a.repesajes.length ? Number(a.repesajes[0].pesoAnteriorKg) : actual;
      return { inicial, actual, merma: r2(inicial - actual) };
    };

    // ---- Por animal ----
    const animales = orden.eventos.map((e) => {
      const pie = pieDeSecuencia(e.sequence);
      const pp = pie ? pesosPie(pie) : null;
      const piezas = e.canalPiezas
        .sort((a, b) => ORDEN_PIEZA[a.pieza] - ORDEN_PIEZA[b.pieza])
        .map((p) => ({
          pieza: p.pieza,
          pesoKg: Number(p.pesoKg),
          turno: p.turno,
          weighedAt: p.weighedAt.toISOString(),
          operario: quien(p.operatorId),
          bodega: p.bodega,
          cava: p.cava,
          destino: p.destino,
          observaciones: p.observaciones,
          traslados: p._count.trasladosCava,
          despacho: p.despacho
            ? `OD${p.despacho.dispatchOrder.odNumber}`
            : p.despachoCanal
              ? `DC${p.despachoCanal.canalDispatchOrder.dcNumber} (${p.despachoCanal.canalDispatchOrder.tipo})`
              : null,
        }));
      const pecKg = piezas.length ? r2(piezas.reduce((s, p) => s + p.pesoKg, 0)) : null;
      const subRegistrados = e.subproductos.filter((sp) => sp.marcado || sp.pesoKg != null);
      return {
        sequence: e.sequence,
        turno: base + e.sequence,
        pie: pie
          ? {
              reference: pie.reference,
              bpReference: pie.bpReference,
              corral: pie.corral,
              sexo: pie.tipoAnimal,
              tipoPesaje: pie.tipoPesaje,
              pesoInicialKg: pp!.inicial,
              pesoActualKg: pp!.actual,
              mermaKg: pp!.merma,
              repesajes: pie.repesajes.length,
              pesadoAt: pie.createdAt.toISOString(),
              operario: quien(pie.createdById),
              observaciones: pie.observaciones,
            }
          : null,
        sacrificio: { at: e.stunnedAt.toISOString(), operario: quien(e.operatorId) },
        piel: {
          kg: n(e.pesoPielKg),
          at: iso(e.pieladoAt),
          operario: quien(e.pielOperatorId),
        },
        canal: {
          tipoAnimal: e.canalAnimalTipo,
          canalTipo: e.canalTipo,
          conCola: e.conCola,
          expendio: e.expendio,
          piezas,
          pecKg,
        },
        subproductos: {
          registrados: subRegistrados.length,
          kg: r2(subRegistrados.reduce((s, sp) => s + (n(sp.pesoKg) ?? 0), 0)),
        },
        rendimiento: pp?.actual && pecKg != null ? r2((pecKg / pp.actual) * 100) : null,
      };
    });

    // ---- Subproductos de la orden, por producto ----
    const subMap = new Map<string, { tipo: string; codigo: string; producto: string; unidad: string; categoria: string; unidades: number; kg: number; animales: number }>();
    for (const e of orden.eventos) {
      for (const sp of e.subproductos) {
        if (!sp.marcado && sp.pesoKg == null) continue;
        const def = SUBPRODUCTO_ITEM_BY_TIPO.get(sp.tipo);
        const cur = subMap.get(sp.tipo) ?? {
          tipo: sp.tipo,
          codigo: def?.codigo ?? '—',
          producto: def?.label ?? sp.tipo,
          unidad: def?.unidad ?? 'unidad',
          categoria: def?.categoria ?? '—',
          unidades: 0,
          kg: 0,
          animales: 0,
        };
        cur.animales += 1;
        if (sp.marcado) cur.unidades += def?.multiplicador ?? 1;
        cur.kg = r2(cur.kg + (n(sp.pesoKg) ?? 0));
        subMap.set(sp.tipo, cur);
      }
    }

    // ---- Peso en Pie de la guía completa ----
    const todosPie = animalesPie.map(pesosPie);
    const pieInicial = r2(todosPie.reduce((s, p) => s + p.inicial, 0));
    const pieActual = r2(todosPie.reduce((s, p) => s + p.actual, 0));
    // Con varias guías, los datos del camión se suman (pesos) o se listan (textos).
    const lista = (xs: (string | null | undefined)[]) =>
      [...new Set(xs.map((x) => x?.trim()).filter((x): x is string => !!x))].join(', ') || null;
    const suma = (xs: (number | null)[]) => (xs.some((x) => x != null) ? r2(xs.reduce<number>((s, x) => s + (x ?? 0), 0)) : null);
    const neto = camiones.length ? suma(camiones.map((c) => n(c.netoKg))) : null;
    const cantidadCamion = camiones.length ? suma(camiones.map((c) => c.cantidad)) : null;
    const mismo = <T,>(xs: T[]) => (new Set(xs).size === 1 ? xs[0] : null);

    // ---- Totales de la orden ----
    const conAmbos = animales.filter((a) => a.pie?.pesoActualKg && a.canal.pecKg != null);
    const pepAmbos = conAmbos.reduce((s, a) => s + a.pie!.pesoActualKg, 0);
    const pecAmbos = conAmbos.reduce((s, a) => s + a.canal.pecKg!, 0);
    const piezasTodas = animales.flatMap((a) => a.canal.piezas);

    return {
      orden: {
        id: orden.id,
        reference: orden.reference,
        date: orden.date.toISOString().slice(0, 10),
        status: orden.status,
        cliente: orden.cliente,
        clienteNit: cliente?.nit ?? null,
        guias: orden.guias,
        animalCount: orden.animalCount,
        observaciones: orden.observaciones,
        cabezasPatas: orden.cabezasPatas,
        subproductoDestino: orden.subproductoDestino,
        subproductoRetiroAt: iso(orden.subproductoRetiroAt),
        subproductoRetiroPor: quien(orden.subproductoRetiroById),
        subproductoRetiroObservaciones: orden.subproductoRetiroObservaciones,
        creadaPor: quien(orden.createdById),
        createdAt: orden.createdAt.toISOString(),
      },
      guia: camiones.length
        ? {
            guia: lista(camiones.map((c) => c.guia)),
            bcReference: camiones[0].reference,
            bcReferencias: camiones.map((c) => c.reference),
            referenciaLote: lista(camiones.map((c) => c.referenciaLote)),
            date: camiones[0].date.toISOString().slice(0, 10),
            procedencia: lista(camiones.map((c) => c.procedencia)),
            proveedor: lista(camiones.map((c) => c.proveedor)),
            cliente: lista(camiones.map((c) => c.cliente)),
            placa: lista(camiones.map((c) => c.placa)),
            conductor: lista(camiones.map((c) => c.conductor)),
            cantidad: cantidadCamion,
            entradaKg: suma(camiones.map((c) => n(c.entrada))),
            salidaKg: suma(camiones.map((c) => n(c.salida))),
            netoKg: neto,
            promedioKg:
              camiones.length === 1
                ? n(camiones[0].pesoPromedioKg)
                : neto != null && cantidadCamion
                  ? r2(neto / cantidadCamion)
                  : null,
            estadoCamion: mismo(camiones.map((c) => c.status)) ?? camiones[0].status,
            estadoPie: mismo(camiones.map((c) => c.pieStatus)) ?? camiones[0].pieStatus,
            observaciones: lista(camiones.map((c) => c.observaciones)),
            registradaPor: lista(camiones.map((c) => quien(c.createdById))),
            createdAt: camiones[0].createdAt.toISOString(),
          }
        : null,
      pie: animalesPie.length
        ? {
            bpReference: animalesPie[0].bpReference,
            bpReferencias: [...new Set(animalesPie.map((a) => a.bpReference))].sort((a, b) => a - b),
            animales: animalesPie.length,
            tiposPesaje: [...new Set(animalesPie.map((a) => a.tipoPesaje))],
            pesoInicialKg: pieInicial,
            pesoActualKg: pieActual,
            mermaRepesajeKg: r2(pieInicial - pieActual),
            repesajes: Math.max(0, ...camiones.map((c) => c.repesajeRonda)),
            diferenciaVsNetoKg: neto != null ? r2(pieActual - neto) : null,
            corrales: [...new Set(animalesPie.map((a) => a.corral).filter(Boolean))].sort(),
          }
        : null,
      animales,
      subproductos: [...subMap.values()].sort((a, b) => a.categoria.localeCompare(b.categoria) || a.producto.localeCompare(b.producto)),
      totales: {
        animales: orden.animalCount,
        sacrificados: animales.length,
        conCanal: animales.filter((a) => a.canal.pecKg != null).length,
        conPiel: animales.filter((a) => a.piel.kg != null).length,
        pepKg: r2(animales.reduce((s, a) => s + (a.pie?.pesoActualKg ?? 0), 0)),
        pecKg: r2(animales.reduce((s, a) => s + (a.canal.pecKg ?? 0), 0)),
        pielKg: r2(animales.reduce((s, a) => s + (a.piel.kg ?? 0), 0)),
        rendimiento: pepAmbos > 0 ? r2((pecAmbos / pepAmbos) * 100) : null,
        piezasCanal: piezasTodas.length,
        piezasDespachadas: piezasTodas.filter((p) => p.despacho).length,
        subproductosKg: r2([...subMap.values()].reduce((s, x) => s + x.kg, 0)),
      },
    };
  }
}
