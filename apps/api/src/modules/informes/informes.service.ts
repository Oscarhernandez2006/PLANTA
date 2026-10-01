import { Injectable, NotFoundException } from '@nestjs/common';
import { CanalPiezaTipo } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthContext } from '../../common/auth/auth-context';
import { plantDateOnly } from '../../common/plant-date';
import { agruparCanales } from '../../common/canales-traslado';

/** Días hacia atrás que abarca el informe desde la fecha elegida. */
const DIAS_INFORME = 60;

/** Producto del catálogo que corresponde a cada pieza de canal (izquierda = con cola, derecha = sin cola). */
const PRODUCTO_POR_PIEZA: Record<CanalPiezaTipo, { codigo: string; nombre: string }> = {
  canal: { codigo: '10001', nombre: 'CANAL COMPLETA DE RES' },
  cizq: { codigo: '10002', nombre: 'MEDIA CANAL CON COLA DE RES' },
  cder: { codigo: '10003', nombre: 'MEDIA CANAL SR DE RES' },
};

const ORDEN_PIEZA: Record<CanalPiezaTipo, number> = { canal: 0, cizq: 1, cder: 2 };

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

  /** 01.7 CANAL/CALIENTE: órdenes con canales pesadas, de la más reciente a la más antigua. */
  async canalCaliente(ctx: AuthContext, hasta?: string) {
    const fin = plantDateOnly(hasta);
    const inicio = new Date(fin);
    inicio.setUTCDate(inicio.getUTCDate() - DIAS_INFORME);

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
        eventos: { select: { canalPiezas: { select: { destino: true } } } },
      },
      orderBy: [{ date: 'desc' }, { reference: 'desc' }],
    });
    return ordenes.map(({ eventos, ...o }) => ({
      ...o,
      date: o.date.toISOString().slice(0, 10),
      destino: destinos(eventos.flatMap((e) => e.canalPiezas)),
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
        eventos: {
          select: {
            sequence: true,
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
              },
            },
          },
        },
      },
    });
    if (!orden) throw new NotFoundException('Orden no encontrada.');

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
      piezas,
    };
  }

  /** Informe de producción: órdenes de producción de los últimos días hasta `hasta`. */
  async produccion(ctx: AuthContext, hasta?: string) {
    const fin = plantDateOnly(hasta);
    const inicio = new Date(fin);
    inicio.setUTCDate(inicio.getUTCDate() - DIAS_INFORME);
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
                    evento: { select: { ordenBeneficio: { select: { date: true } } } },
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

    // Pesaje y etiquetado: una fila por canastilla de Rotulado Desposte (producto + tienda),
    // igual a como se empacó.
    const etiquetas = await this.prisma.rotuladoEtiqueta.findMany({
      where: { productionOrderId: op.id, deletedAt: null },
      select: {
        netoKg: true,
        sobrante: true,
        canastillaId: true,
        product: { select: { codigo: true, nombre: true } },
        tienda: { select: { codigo: true, nombre: true } },
        canastilla: { select: { numero: true } },
      },
    });
    // El rendimiento se calcula contra los kilos de materia prima (canales en frío).
    const kgMateriaPrima = detalle.reduce((a, r) => a + r.kg, 0);
    const porCanastilla = new Map<
      string,
      {
        codigo: string;
        producto: string;
        tiendaCodigo: string;
        tienda: string;
        canastilla: number | null;
        unds: number;
        sobrantes: number;
        kg: number;
      }
    >();
    for (const e of etiquetas) {
      const clave = e.canastillaId ?? `${e.product.codigo}:${e.tienda.codigo}:sin`;
      const fila = porCanastilla.get(clave) ?? {
        codigo: e.product.codigo,
        producto: e.product.nombre,
        tiendaCodigo: e.tienda.codigo,
        tienda: e.tienda.nombre,
        canastilla: e.canastilla?.numero ?? null,
        unds: 0,
        sobrantes: 0,
        kg: 0,
      };
      fila.unds += 1;
      if (e.sobrante) fila.sobrantes += 1;
      fila.kg += Number(e.netoKg);
      porCanastilla.set(clave, fila);
    }
    const etiquetado = [...porCanastilla.values()]
      .sort(
        (a, b) =>
          a.codigo.localeCompare(b.codigo, 'es', { numeric: true }) ||
          a.tiendaCodigo.localeCompare(b.tiendaCodigo, 'es', { numeric: true }) ||
          (a.canastilla ?? 0) - (b.canastilla ?? 0),
      )
      .map((f) => ({
        ...f,
        kg: Number(f.kg.toFixed(2)),
        rendimiento: kgMateriaPrima > 0 ? Number(((f.kg / kgMateriaPrima) * 100).toFixed(2)) : 0,
      }));

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
      detalle,
      etiquetado,
    };
  }
}
