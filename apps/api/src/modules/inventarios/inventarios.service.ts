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

@Injectable()
export class InventariosService {
  constructor(private readonly prisma: PrismaService) {}

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
    return piezas.map((p) => ({
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
    }));
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
    return bodegas.map((b) => {
      const p = productos.find((x) => x.bodegaId === b.id);
      const a = acond.find((x) => x.bodegaId === b.id);
      const clave = `${b.cliente.concepto}|${b.nombre}`;
      return {
        id: b.id,
        code: b.code,
        nombre: b.nombre,
        clienteId: b.cliente.id,
        clienteNit: b.cliente.nit,
        cliente: b.cliente.concepto,
        canales: canalesPor.get(clave)?.n ?? 0,
        canalesKg: canalesPor.get(clave)?.kg ?? 0,
        canalesDespachadas: canalesPor.get(clave)?.despachadas ?? 0,
        canalesProcesadas: canalesPor.get(clave)?.procesadas ?? 0,
        productos: (p?._count._all ?? 0) + (a?._count._all ?? 0),
        productosKg: Number(p?._sum.netoKg ?? 0) + Number(a?._sum.netoKg ?? 0),
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
          productionOrder: { select: { opNumber: true } },
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

    return {
      id: b.id,
      code: b.code,
      nombre: b.nombre,
      clienteNit: b.cliente.nit,
      cliente: b.cliente.concepto,
      canales: canales.map((c) => ({
        id: c.id,
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
      })),
      productos: [
        ...etiquetas.map((e) => {
          const ot = e.traslado?.transferOrder ?? e.canastilla?.traslado?.transferOrder ?? null;
          // Si la OC de su OT ya se cerró, la pieza se transformó en otro producto.
          const transformada = ot?.conditioningOrders.find((o) => o.status === 'facturado');
          return {
            id: e.id,
            codigo: e.codigo,
            pieza: e.pieza,
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
            opNumber: e.productionOrder.opNumber as number | null,
            ocNumber: null as number | null,
            trasladoOt: ot?.otNumber ?? null,
            transformadoOc: transformada?.ocNumber ?? null,
            origenOt: null as number | null,
            despachoDc:
              (e.despacho ?? e.canastilla?.despacho)?.canalDispatchOrder.dcNumber ?? (null as number | null),
          };
        }),
        ...acond.map((e) => ({
          id: e.id,
          codigo: e.codigo,
          pieza: e.pieza,
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
          opNumber: null,
          ocNumber: e.conditioningOrder.ocNumber,
          trasladoOt: null,
          transformadoOc: null,
          origenOt: e.conditioningOrder.transferOrder.otNumber,
          despachoDc: e.despacho?.canalDispatchOrder.dcNumber ?? null,
        })),
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
    const guia = orden.guias.length === 1 ? orden.guias[0].trim() : null;
    const destinoProceso = p.despacho
      ? await this.productosDeOps(
          ctx,
          p.despacho.dispatchOrderId,
          p.despacho.dispatchOrder.productionOrders.map((o) => o.id),
          p.eventoId,
        )
      : null;

    const [camion, animalesPie, previas] = await Promise.all([
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
    ]);
    // Asignación explícita a la orden; si no existe (órdenes antiguas), por posición en la guía.
    const explicitos = animalesPie.filter((a) => a.ordenBeneficioId === orden.id);
    const pie = explicitos.length
      ? explicitos.find((a) => a.ordenSequence === e.sequence)
      : animalesPie.find((a) => a.reference === (previas?._sum.animalCount ?? 0) + e.sequence);

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
                        sequence: true,
                        canalTipo: true,
                        canalAnimalTipo: true,
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
          select: { ocNumber: true, status: true },
        })
      : null;

    const ids = new Set<string>([e.createdById]);
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

    return {
      tipo: des ? ('desposte' as const) : ('acondicionamiento' as const),
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
          };
        }),
      })),
    };
  }
}
