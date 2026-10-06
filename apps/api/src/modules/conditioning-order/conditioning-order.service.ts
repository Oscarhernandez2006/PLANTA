import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DispatchOrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthContext } from '../../common/auth/auth-context';
import {
  CreateConditioningOrderDto,
  CrearEtiquetaAcondDto,
  QueryConditioningOrderDto,
} from './conditioning-order.dto';

const include = {
  cliente: { select: { id: true, nit: true, concepto: true } },
  transferOrder: { select: { id: true, otNumber: true } },
} as const;

@Injectable()
export class ConditioningOrderService {
  constructor(private readonly prisma: PrismaService) {}

  /** Próximo número de O.C. (solo previsualización; el definitivo se asigna al guardar). */
  async nextNumber(ctx: AuthContext) {
    const agg = await this.prisma.conditioningOrder.aggregate({
      _max: { ocNumber: true },
      where: { plantId: ctx.plantId },
    });
    return { next: (agg._max.ocNumber ?? 0) + 1 };
  }

  async create(ctx: AuthContext, dto: CreateConditioningOrderDto) {
    const cliente = await this.prisma.cliente.findFirst({
      where: { id: dto.clienteId, active: true },
      select: { id: true },
    });
    if (!cliente) throw new BadRequestException('El cliente no existe o está inactivo.');

    const ot = await this.prisma.transferOrder.findFirst({
      where: { id: dto.transferOrderId, plantId: ctx.plantId, deletedAt: null },
      select: { clienteId: true, status: true },
    });
    if (!ot) throw new BadRequestException('La orden de traslado no existe.');
    if (ot.clienteId !== dto.clienteId) {
      throw new BadRequestException('La orden de traslado no pertenece a ese cliente.');
    }
    // Una OT cerrada queda finalizada (facturado).
    if (ot.status !== DispatchOrderStatus.facturado) {
      throw new BadRequestException('La orden de traslado aún no está cerrada.');
    }

    return this.prisma.$transaction(async (tx) => {
      // Serializa la numeración por planta.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${ctx.plantId}:oc`}))`;
      const agg = await tx.conditioningOrder.aggregate({
        _max: { ocNumber: true },
        where: { plantId: ctx.plantId },
      });
      return tx.conditioningOrder.create({
        data: {
          plantId: ctx.plantId,
          ocNumber: (agg._max.ocNumber ?? 0) + 1,
          registrationDate: new Date(dto.registrationDate),
          processDate: new Date(dto.processDate),
          clienteId: dto.clienteId,
          transferOrderId: dto.transferOrderId,
          status: dto.status ?? DispatchOrderStatus.activo,
          createdById: ctx.userId,
        },
        include,
      });
    });
  }

  async findAll(ctx: AuthContext, query: QueryConditioningOrderDto) {
    const where: Prisma.ConditioningOrderWhereInput = {
      plantId: ctx.plantId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
    };
    const [total, data] = await this.prisma.$transaction([
      this.prisma.conditioningOrder.count({ where }),
      this.prisma.conditioningOrder.findMany({
        where,
        orderBy: { ocNumber: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include,
      }),
    ]);
    return {
      data,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  // ---- Rotulado Acondicionamiento ----

  private async orden(ctx: AuthContext, id: string) {
    const oc = await this.prisma.conditioningOrder.findFirst({
      where: { id, plantId: ctx.plantId, deletedAt: null },
      select: {
        id: true,
        ocNumber: true,
        clienteId: true,
        status: true,
        transferOrderId: true,
        transferOrder: { select: { otNumber: true } },
      },
    });
    if (!oc) throw new NotFoundException('Orden de acondicionamiento no encontrada.');
    return oc;
  }

  /** Lo trasladado en la OT de la orden (materia prima del acondicionamiento), con su origen. */
  private async origen(transferOrderId: string) {
    const items = await this.prisma.transferOrderItem.findMany({
      where: { transferOrderId },
      orderBy: { createdAt: 'asc' },
      select: {
        codigo: true,
        unds: true,
        netoKg: true,
        productId: true,
        product: { select: { codigo: true, nombre: true } },
        etiqueta: {
          select: { fechaSacrificio: true, productionOrder: { select: { opNumber: true } } },
        },
        canastilla: {
          select: {
            numero: true,
            productionOrder: { select: { opNumber: true } },
            etiquetas: {
              where: { deletedAt: null },
              orderBy: { fechaSacrificio: 'asc' },
              take: 1,
              select: { fechaSacrificio: true },
            },
          },
        },
      },
    });
    return items.map((i) => ({
      codigo: i.codigo,
      tipo: i.canastilla ? ('canastilla' as const) : ('pieza' as const),
      productId: i.productId,
      productoCodigo: i.product.codigo,
      productoNombre: i.product.nombre,
      unds: i.unds,
      netoKg: Number(i.netoKg),
      opNumber: i.etiqueta?.productionOrder.opNumber ?? i.canastilla?.productionOrder.opNumber ?? null,
      sacrificio: i.etiqueta?.fechaSacrificio ?? i.canastilla?.etiquetas[0]?.fechaSacrificio ?? null,
    }));
  }

  /** Reporte: lo recibido por traslado, lo producido (etiquetado) y la merma. */
  async resumen(ctx: AuthContext, id: string) {
    const oc = await this.orden(ctx, id);
    const [origen, producidos] = await Promise.all([
      this.origen(oc.transferOrderId),
      this.prisma.acondicionamientoEtiqueta.groupBy({
        by: ['productId'],
        where: { conditioningOrderId: oc.id, deletedAt: null },
        _count: { _all: true },
        _sum: { netoKg: true },
      }),
    ]);
    const recibido = new Map<
      string,
      { productoCodigo: string; productoNombre: string; empaques: number; unds: number; netoKg: number }
    >();
    for (const i of origen) {
      const g = recibido.get(i.productId) ?? {
        productoCodigo: i.productoCodigo,
        productoNombre: i.productoNombre,
        empaques: 0,
        unds: 0,
        netoKg: 0,
      };
      g.empaques += 1;
      g.unds += i.unds;
      g.netoKg += i.netoKg;
      recibido.set(i.productId, g);
    }
    const productos = producidos.length
      ? await this.prisma.product.findMany({
          where: { id: { in: producidos.map((p) => p.productId) } },
          select: { id: true, codigo: true, nombre: true },
        })
      : [];
    const recibidoKg = round(origen.reduce((s, i) => s + i.netoKg, 0));
    const procesadoKg = round(producidos.reduce((s, p) => s + Number(p._sum.netoKg ?? 0), 0));
    const mermaKg = round(recibidoKg - procesadoKg);
    const fechas = origen.map((i) => i.sacrificio).filter((d): d is Date => !!d);
    const sacrificio = fechas.length
      ? new Date(Math.min(...fechas.map((d) => d.getTime()))).toISOString().slice(0, 10)
      : null;
    return {
      ocNumber: oc.ocNumber,
      otNumber: oc.transferOrder.otNumber,
      activa: oc.status === DispatchOrderStatus.activo,
      sacrificio,
      recibido: [...recibido.values()]
        .map((g) => ({ ...g, netoKg: round(g.netoKg) }))
        .sort((a, b) => a.productoCodigo.localeCompare(b.productoCodigo, 'es', { numeric: true })),
      productos: producidos
        .map((p) => {
          const prod = productos.find((x) => x.id === p.productId);
          return {
            productoCodigo: prod?.codigo ?? '',
            productoNombre: prod?.nombre ?? '',
            unds: p._count._all,
            netoKg: round(Number(p._sum.netoKg ?? 0)),
          };
        })
        .sort((a, b) => a.productoCodigo.localeCompare(b.productoCodigo, 'es', { numeric: true })),
      recibidoKg,
      procesadoKg,
      mermaKg,
      mermaPct: recibidoKg > 0 ? round((mermaKg / recibidoKg) * 100) : 0,
    };
  }

  async etiquetas(ctx: AuthContext, id: string, productId?: string) {
    await this.orden(ctx, id);
    const rows = await this.prisma.acondicionamientoEtiqueta.findMany({
      where: { conditioningOrderId: id, deletedAt: null, ...(productId ? { productId } : {}) },
      orderBy: { createdAt: 'desc' },
      select: etiquetaSelect,
    });
    return rows.map(etiquetaDto);
  }

  /** Etiqueta el producto nuevo: el servidor asigna la pieza y el código de barras. */
  async crearEtiqueta(ctx: AuthContext, id: string, dto: CrearEtiquetaAcondDto) {
    const oc = await this.orden(ctx, id);
    if (oc.status !== DispatchOrderStatus.activo) {
      throw new BadRequestException('La orden de acondicionamiento no está activa.');
    }
    const [cp, tienda, bodega, product, resumen] = await Promise.all([
      this.prisma.clienteProducto.findFirst({
        where: { clienteId: oc.clienteId, productId: dto.productId, product: { plantId: ctx.plantId } },
        select: { productId: true },
      }),
      this.prisma.clienteTienda.findFirst({
        where: { id: dto.tiendaId, clienteId: oc.clienteId, active: true },
        select: { id: true },
      }),
      dto.bodegaId
        ? this.prisma.bodega.findFirst({
            where: { id: dto.bodegaId, clienteId: oc.clienteId },
            select: { id: true },
          })
        : Promise.resolve(null),
      this.prisma.product.findUnique({ where: { id: dto.productId }, select: { codigo: true } }),
      this.resumen(ctx, id),
    ]);
    if (!cp || !product) throw new BadRequestException('El producto no está en la conservación del cliente.');
    if (!tienda) throw new BadRequestException('La tienda no pertenece al cliente de la orden.');
    if (dto.bodegaId && !bodega) throw new BadRequestException('La bodega no pertenece al cliente de la orden.');
    if (!resumen.recibido.length || !resumen.sacrificio) {
      throw new BadRequestException(
        `La orden de traslado ${formatOT(resumen.otNumber)} no tiene productos trasladados.`,
      );
    }

    try {
      const creada = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`acond:${oc.id}:${dto.productId}`}))`;
        // Las borradas también cuentan: su código no se reutiliza.
        const agg = await tx.acondicionamientoEtiqueta.aggregate({
          _max: { pieza: true },
          where: { conditioningOrderId: oc.id, productId: dto.productId },
        });
        const pieza = (agg._max.pieza ?? 0) + 1;
        if (pieza > 9999) throw new BadRequestException('Se agotó el consecutivo de etiquetas para este producto.');
        return tx.acondicionamientoEtiqueta.create({
          data: {
            plantId: ctx.plantId,
            conditioningOrderId: oc.id,
            productId: dto.productId,
            tiendaId: dto.tiendaId,
            bodegaId: dto.bodegaId ?? null,
            pieza,
            codigo: codigoAcond(oc.ocNumber, product.codigo, pieza),
            taraKg: dto.taraKg,
            brutoKg: dto.brutoKg,
            netoKg: dto.netoKg,
            empaque: dto.empaque,
            conservacion: dto.conservacion,
            temperatura: dto.temperatura,
            fechaSacrificio: new Date(resumen.sacrificio!),
            fechaEmpaque: new Date(dto.fechaEmpaque),
            fechaVencimiento: dto.fechaVencimiento ? new Date(dto.fechaVencimiento) : null,
            ref: dto.ref || null,
            procesadoPara: dto.procesadoPara || null,
            impresa: dto.impresa,
            estacion: dto.estacion || null,
            createdById: ctx.userId,
          },
          select: etiquetaSelect,
        });
      });
      return etiquetaDto(creada);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('La etiqueta ya está registrada; intenta de nuevo.');
      }
      throw err;
    }
  }

  async borrarEtiqueta(ctx: AuthContext, etiquetaId: string) {
    const e = await this.prisma.acondicionamientoEtiqueta.findFirst({
      where: { id: etiquetaId, plantId: ctx.plantId, deletedAt: null },
      select: { id: true, conditioningOrder: { select: { status: true } } },
    });
    if (!e) throw new NotFoundException('Etiqueta no encontrada.');
    if (e.conditioningOrder.status !== DispatchOrderStatus.activo) {
      throw new BadRequestException('La orden de acondicionamiento ya está cerrada.');
    }
    await this.prisma.acondicionamientoEtiqueta.update({
      where: { id: e.id },
      data: { deletedAt: new Date(), deletedById: ctx.userId },
    });
    return { ok: true };
  }

  /** Cierra la orden: lo trasladado queda transformado en lo etiquetado. */
  async cerrar(ctx: AuthContext, id: string) {
    const oc = await this.orden(ctx, id);
    if (oc.status !== DispatchOrderStatus.activo) {
      throw new BadRequestException('La orden de acondicionamiento no está activa.');
    }
    const hechas = await this.prisma.acondicionamientoEtiqueta.count({
      where: { conditioningOrderId: oc.id, deletedAt: null },
    });
    if (!hechas) throw new BadRequestException('La orden no tiene productos etiquetados.');
    await this.prisma.conditioningOrder.update({
      where: { id: oc.id },
      data: { status: DispatchOrderStatus.facturado },
    });
    return { ok: true };
  }

  /** Reimpresión y trazabilidad: la etiqueta con la OC, su OT y los productos de origen. */
  async buscarEtiqueta(ctx: AuthContext, codigo: string) {
    const valor = codigo.trim().toUpperCase();
    if (!/^A\d{7}\d+\d{4}$/.test(valor)) throw new BadRequestException('Código de barras no válido.');
    const e = await this.prisma.acondicionamientoEtiqueta.findFirst({
      where: { codigo: valor, plantId: ctx.plantId, deletedAt: null },
      select: {
        ...etiquetaSelect,
        conditioningOrder: {
          select: {
            ocNumber: true,
            transferOrderId: true,
            transferOrder: { select: { otNumber: true } },
            cliente: { select: { concepto: true, nit: true } },
          },
        },
      },
    });
    if (!e) throw new NotFoundException('No se encontró la etiqueta (o fue borrada).');
    const origen = await this.origen(e.conditioningOrder.transferOrderId);
    return {
      ...etiquetaDto(e),
      ocNumber: e.conditioningOrder.ocNumber,
      otNumber: e.conditioningOrder.transferOrder.otNumber,
      cliente: e.conditioningOrder.cliente.concepto,
      clienteNit: e.conditioningOrder.cliente.nit,
      origen: origen.map(({ productId: _p, sacrificio, ...o }) => ({
        ...o,
        sacrificio: sacrificio ? sacrificio.toISOString().slice(0, 10) : null,
      })),
    };
  }
}

const round = (n: number) => Number(n.toFixed(2));
const formatOT = (n: number) => `OT${String(n).padStart(7, '0')}`;
const dia = (d: Date) => d.toISOString().slice(0, 10);

/** Código de barras: A + lote (OC, 7 dígitos) + código de producto + pieza (4 dígitos). */
const codigoAcond = (ocNumber: number, productoCodigo: string, pieza: number) =>
  `A${String(ocNumber).padStart(7, '0')}${productoCodigo.replace(/\D/g, '')}${String(pieza).padStart(4, '0')}`;

const etiquetaSelect = {
  id: true,
  pieza: true,
  codigo: true,
  taraKg: true,
  brutoKg: true,
  netoKg: true,
  empaque: true,
  conservacion: true,
  temperatura: true,
  fechaSacrificio: true,
  fechaEmpaque: true,
  fechaVencimiento: true,
  ref: true,
  procesadoPara: true,
  impresa: true,
  estacion: true,
  createdAt: true,
  product: { select: { id: true, codigo: true, nombre: true } },
  tienda: { select: { id: true, codigo: true, nombre: true } },
  bodega: { select: { code: true, nombre: true } },
  createdBy: { select: { fullName: true } },
} as const;

const etiquetaDto = (e: Prisma.AcondicionamientoEtiquetaGetPayload<{ select: typeof etiquetaSelect }>) => ({
  id: e.id,
  pieza: e.pieza,
  codigo: e.codigo,
  productId: e.product.id,
  productoCodigo: e.product.codigo,
  productoNombre: e.product.nombre,
  tiendaId: e.tienda.id,
  tiendaCodigo: e.tienda.codigo,
  tiendaNombre: e.tienda.nombre,
  taraKg: Number(e.taraKg),
  brutoKg: Number(e.brutoKg),
  netoKg: Number(e.netoKg),
  empaque: e.empaque,
  conservacion: e.conservacion,
  temperatura: e.temperatura,
  fechaSacrificio: dia(e.fechaSacrificio),
  fechaEmpaque: dia(e.fechaEmpaque),
  fechaVencimiento: e.fechaVencimiento ? dia(e.fechaVencimiento) : null,
  ref: e.ref,
  procesadoPara: e.procesadoPara,
  impresa: e.impresa,
  estacion: e.estacion,
  bodega: e.bodega ? `${e.bodega.code} - ${e.bodega.nombre}` : null,
  usuario: e.createdBy.fullName,
  createdAt: e.createdAt.toISOString(),
});
