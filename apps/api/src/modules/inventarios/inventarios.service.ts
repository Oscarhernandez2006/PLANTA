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

  /** Canales que siguen en inventario: en una cava o dentro de una orden de despacho (OD o DC) activa. */
  private canalEnInventario(ctx: AuthContext, cliente?: string): Prisma.CanalPiezaWhereInput {
    return {
      OR: [
        { cava: { not: null } },
        { despacho: { dispatchOrder: { status: DispatchOrderStatus.activo, deletedAt: null } } },
        {
          despachoCanal: {
            canalDispatchOrder: { status: DispatchOrderStatus.activo, deletedAt: null },
          },
        },
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
        where: { ...this.canalEnInventario(ctx), bodega: { not: null } },
        select: { bodega: true, evento: { select: { ordenBeneficio: { select: { cliente: true } } } } },
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
    const canalesPor = new Map<string, number>();
    for (const c of canales) {
      const clave = `${c.evento.ordenBeneficio.cliente}|${c.bodega}`;
      canalesPor.set(clave, (canalesPor.get(clave) ?? 0) + 1);
    }
    return bodegas.map((b) => {
      const p = productos.find((x) => x.bodegaId === b.id);
      const a = acond.find((x) => x.bodegaId === b.id);
      return {
        id: b.id,
        code: b.code,
        nombre: b.nombre,
        clienteId: b.cliente.id,
        clienteNit: b.cliente.nit,
        cliente: b.cliente.concepto,
        canales: canalesPor.get(`${b.cliente.concepto}|${b.nombre}`) ?? 0,
        productos: (p?._count._all ?? 0) + (a?._count._all ?? 0),
        productosKg: Number(p?._sum.netoKg ?? 0) + Number(a?._sum.netoKg ?? 0),
      };
    });
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

    const [canales, etiquetas, acond] = await Promise.all([
      this.prisma.canalPieza.findMany({
        where: { ...this.canalEnInventario(ctx, b.cliente.concepto), bodega: b.nombre },
        orderBy: { weighedAt: 'desc' },
        select: {
          id: true,
          pieza: true,
          turno: true,
          cava: true,
          destino: true,
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
              canalDispatchOrder: { select: { dcNumber: true, tipo: true } },
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
            }
          : null,
        enDespacho: c.despachoCanal ? c.despachoCanal.canalDispatchOrder : null,
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
}
