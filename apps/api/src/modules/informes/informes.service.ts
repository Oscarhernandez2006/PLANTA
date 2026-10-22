import { Injectable, NotFoundException } from '@nestjs/common';
import { CanalPiezaTipo } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthContext } from '../../common/auth/auth-context';
import { plantDateOnly } from '../../common/plant-date';
import { agruparCanales } from '../../common/canales-traslado';
import { SUBPRODUCTO_ITEM_BY_TIPO } from '../subproductos/subproducto-items';

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
  // ===================== Informe de sacrificio =====================

  /** INFORME DE SACRIFICIO: órdenes con animales sacrificados, de la más reciente a la más antigua. */
  async sacrificio(ctx: AuthContext, hasta?: string) {
    const fin = plantDateOnly(hasta);
    const inicio = new Date(fin);
    inicio.setUTCDate(inicio.getUTCDate() - DIAS_INFORME);
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
   * Detalle por animal: peso en pie (PEP), turno, peso en caliente (PEC),
   * piel y rendimiento (PEC ÷ PEP). El PEP es el peso individual del animal
   * en Peso en Pie: el animal N de la orden es el N de su guía; si la guía se
   * repartió en varias órdenes del día, se desplaza por los animales de las
   * órdenes anteriores de esa guía.
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
            canalPiezas: { select: { pesoKg: true } },
          },
        },
      },
    });
    if (!orden) throw new NotFoundException('Orden no encontrada.');

    // Solo se cruza con Peso en Pie si la orden tiene una única guía.
    const guia = orden.guias.length === 1 ? orden.guias[0].trim() : null;
    const [previas, animalesPie, camion, delDia, cliente] = await Promise.all([
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
            select: { reference: true, pesoTotalKg: true, tipoAnimal: true, procedencia: true },
          })
        : [],
      guia
        ? this.prisma.pesoCamion.findFirst({
            where: { plantId: ctx.plantId, deletedAt: null, date: orden.date, guia },
            select: { procedencia: true },
          })
        : null,
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

    const desfase = previas?._sum.animalCount ?? 0;
    const piePorReferencia = new Map(animalesPie.map((a) => [a.reference, a]));
    let base = 0;
    for (const o of delDia) {
      if (o.id === orden.id) break;
      base += o.animalCount;
    }
    const finca = camion?.procedencia ?? animalesPie[0]?.procedencia ?? null;
    const r1 = (n: number) => Math.round(n * 100) / 100;

    const animales = orden.eventos.map((e) => {
      const pie = piePorReferencia.get(desfase + e.sequence);
      const pepKg = pie?.pesoTotalKg == null ? null : Number(pie.pesoTotalKg);
      const pecKg = e.canalPiezas.length
        ? r1(e.canalPiezas.reduce((s, p) => s + Number(p.pesoKg), 0))
        : null;
      return {
        sequence: e.sequence,
        turno: base + e.sequence,
        tipo: e.canalAnimalTipo?.toUpperCase() ?? pie?.tipoAnimal ?? null,
        stunnedAt: e.stunnedAt.toISOString(),
        pepKg,
        pecKg,
        pielKg: e.pesoPielKg == null ? null : Number(e.pesoPielKg),
        rendimiento: pepKg && pecKg != null ? r1((pecKg / pepKg) * 100) : null,
      };
    });

    const suma = (k: 'pepKg' | 'pecKg' | 'pielKg') =>
      r1(animales.reduce((s, a) => s + (a[k] ?? 0), 0));
    // El rendimiento total solo cuenta animales con PEP y PEC.
    const conAmbos = animales.filter((a) => a.pepKg && a.pecKg != null);
    const pepAmbos = conAmbos.reduce((s, a) => s + a.pepKg!, 0);
    const pecAmbos = conAmbos.reduce((s, a) => s + a.pecKg!, 0);

    return {
      id: orden.id,
      reference: orden.reference,
      date: orden.date.toISOString().slice(0, 10),
      status: orden.status,
      cliente: orden.cliente,
      clienteNit: cliente?.nit ?? null,
      guias: orden.guias,
      finca,
      animalCount: orden.animalCount,
      animales,
      totales: {
        animales: animales.length,
        pepKg: suma('pepKg'),
        pecKg: suma('pecKg'),
        pielKg: suma('pielKg'),
        rendimiento: pepAmbos > 0 ? r1((pecAmbos / pepAmbos) * 100) : null,
      },
    };
  }
  // ===================== Informe de proceso general =====================

  /** Órdenes de beneficio del periodo (todas, con o sin animales sacrificados). */
  async procesoGeneral(ctx: AuthContext, hasta?: string) {
    const fin = plantDateOnly(hasta);
    const inicio = new Date(fin);
    inicio.setUTCDate(inicio.getUTCDate() - DIAS_INFORME);
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
    const [camion, animalesPie, previas, delDia, cliente] = await Promise.all([
      guia
        ? this.prisma.pesoCamion.findFirst({
            where: { plantId: ctx.plantId, deletedAt: null, date: orden.date, guia },
          })
        : null,
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
    if (camion) ids.add(camion.createdById);
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
    const pesosPie = (a: (typeof animalesPie)[number]) => {
      const actual = n(a.pesoTotalKg) ?? 0;
      const inicial = a.repesajes.length ? Number(a.repesajes[0].pesoAnteriorKg) : actual;
      return { inicial, actual, merma: r2(inicial - actual) };
    };

    // ---- Por animal ----
    const animales = orden.eventos.map((e) => {
      const pie = piePorReferencia.get(desfase + e.sequence);
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
            ? `OD${String(p.despacho.dispatchOrder.odNumber).padStart(6, '0')}`
            : p.despachoCanal
              ? `DC${String(p.despachoCanal.canalDispatchOrder.dcNumber).padStart(6, '0')} (${p.despachoCanal.canalDispatchOrder.tipo})`
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
    const neto = n(camion?.netoKg);

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
      guia: camion
        ? {
            guia: camion.guia,
            bcReference: camion.reference,
            referenciaLote: camion.referenciaLote,
            date: camion.date.toISOString().slice(0, 10),
            procedencia: camion.procedencia,
            proveedor: camion.proveedor,
            cliente: camion.cliente,
            placa: camion.placa,
            conductor: camion.conductor,
            cantidad: camion.cantidad,
            entradaKg: n(camion.entrada),
            salidaKg: n(camion.salida),
            netoKg: neto,
            promedioKg: n(camion.pesoPromedioKg),
            estadoCamion: camion.status,
            estadoPie: camion.pieStatus,
            observaciones: camion.observaciones,
            registradaPor: quien(camion.createdById),
            createdAt: camion.createdAt.toISOString(),
          }
        : null,
      pie: animalesPie.length
        ? {
            bpReference: animalesPie[0].bpReference,
            animales: animalesPie.length,
            tiposPesaje: [...new Set(animalesPie.map((a) => a.tipoPesaje))],
            pesoInicialKg: pieInicial,
            pesoActualKg: pieActual,
            mermaRepesajeKg: r2(pieInicial - pieActual),
            repesajes: camion?.repesajeRonda ?? 0,
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
