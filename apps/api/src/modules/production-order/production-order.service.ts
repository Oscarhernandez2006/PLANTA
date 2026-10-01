import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DispatchOrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthContext } from '../../common/auth/auth-context';
import { agruparCanales } from '../../common/canales-traslado';
import {
  AsignarTiendaDto,
  CreateProductionOrderDto,
  GuardarEtiquetaDto,
  QueryEtiquetasDto,
  QueryProductionOrderDto,
} from './production-order.dto';

const include = {
  cliente: { select: { id: true, nit: true, concepto: true } },
  dispatchOrder: { select: { id: true, odNumber: true } },
} as const;

const etiquetaSelect = {
  id: true,
  pieza: true,
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
  sobrante: true,
  createdAt: true,
  tienda: { select: { id: true, codigo: true, nombre: true } },
  canastilla: { select: { numero: true, cerradaAt: true } },
} as const;

type EtiquetaRow = Prisma.RotuladoEtiquetaGetPayload<{ select: typeof etiquetaSelect }>;

const dia = (d: Date) => d.toISOString().slice(0, 10);

const etiquetaDto = (e: EtiquetaRow) => ({
  id: e.id,
  pieza: e.pieza,
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
  sobrante: e.sobrante,
  tiendaId: e.tienda.id,
  tiendaCodigo: e.tienda.codigo,
  tiendaNombre: e.tienda.nombre,
  canastillaNumero: e.canastilla?.numero ?? null,
  canastillaCerrada: !!e.canastilla?.cerradaAt,
  createdAt: e.createdAt.toISOString(),
});

const canastillaSelect = {
  id: true,
  numero: true,
  tiendaId: true,
  taraKg: true,
  brutoKg: true,
  cerradaAt: true,
  tienda: { select: { codigo: true, nombre: true } },
  etiquetas: {
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' },
    select: {
      netoKg: true,
      taraKg: true,
      sobrante: true,
      empaque: true,
      conservacion: true,
      temperatura: true,
      fechaSacrificio: true,
      fechaEmpaque: true,
      fechaVencimiento: true,
      ref: true,
    },
  },
} as const;

type CanastillaRow = Prisma.RotuladoCanastillaGetPayload<{ select: typeof canastillaSelect }>;

/** Canastilla con sus totales y los datos de la última pieza (para imprimir su etiqueta). */
const canastillaDto = (c: CanastillaRow) => {
  const ultima = c.etiquetas[0];
  const neto = c.etiquetas.reduce((s, e) => s + Number(e.netoKg), 0);
  return {
    id: c.id,
    numero: c.numero,
    tiendaId: c.tiendaId,
    tiendaCodigo: c.tienda.codigo,
    tiendaNombre: c.tienda.nombre,
    unds: c.etiquetas.length,
    sobrantes: c.etiquetas.filter((e) => e.sobrante).length,
    netoKg: Number(neto.toFixed(2)),
    // Todas las piezas de una canastilla se pesan con la misma tara (la de la canastilla).
    taraPiezas: ultima ? Number(ultima.taraKg) : null,
    taraKg: c.taraKg === null ? null : Number(c.taraKg),
    brutoKg: c.brutoKg === null ? null : Number(c.brutoKg),
    cerrada: c.cerradaAt !== null,
    cerradaAt: c.cerradaAt?.toISOString() ?? null,
    datos: ultima
      ? {
          empaque: ultima.empaque,
          conservacion: ultima.conservacion,
          temperatura: ultima.temperatura,
          fechaSacrificio: dia(ultima.fechaSacrificio),
          fechaEmpaque: dia(ultima.fechaEmpaque),
          fechaVencimiento: ultima.fechaVencimiento ? dia(ultima.fechaVencimiento) : null,
          ref: ultima.ref,
        }
      : null,
  };
};

type Db = Prisma.TransactionClient;
type EstadoRotulado = Awaited<ReturnType<ProductionOrderService['estadoProducto']>>;

@Injectable()
export class ProductionOrderService {
  constructor(private readonly prisma: PrismaService) {}

  /** Próximo número de O.P. (solo previsualización; el definitivo se asigna al guardar). */
  async nextNumber(ctx: AuthContext) {
    const agg = await this.prisma.productionOrder.aggregate({
      _max: { opNumber: true },
      where: { plantId: ctx.plantId },
    });
    return { next: (agg._max.opNumber ?? 0) + 1 };
  }

  async create(ctx: AuthContext, dto: CreateProductionOrderDto) {
    const cliente = await this.prisma.cliente.findFirst({
      where: { id: dto.clienteId, active: true },
      select: { id: true },
    });
    if (!cliente) throw new BadRequestException('El cliente no existe o está inactivo.');

    const od = await this.prisma.dispatchOrder.findFirst({
      where: { id: dto.dispatchOrderId, plantId: ctx.plantId, deletedAt: null },
      select: { clienteId: true, status: true },
    });
    if (!od) throw new BadRequestException('La orden de despacho no existe.');
    if (od.clienteId !== dto.clienteId) {
      throw new BadRequestException('La orden de despacho no pertenece a ese cliente.');
    }
    if (od.status !== DispatchOrderStatus.activo) {
      throw new BadRequestException('La orden de despacho no está activa.');
    }

    return this.prisma.$transaction(async (tx) => {
      // Serializa la numeración por planta.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${ctx.plantId}:op`}))`;
      const agg = await tx.productionOrder.aggregate({
        _max: { opNumber: true },
        where: { plantId: ctx.plantId },
      });
      return tx.productionOrder.create({
        data: {
          plantId: ctx.plantId,
          opNumber: (agg._max.opNumber ?? 0) + 1,
          registrationDate: new Date(dto.registrationDate),
          processDate: new Date(dto.processDate),
          clienteId: dto.clienteId,
          dispatchOrderId: dto.dispatchOrderId,
          status: dto.status ?? DispatchOrderStatus.activo,
          createdById: ctx.userId,
        },
        include,
      });
    });
  }

  /**
   * Estado de un producto en Rotulado: piezas que le tocan a cada tienda preparada
   * (canales asignadas × piezas por canal), lo ya etiquetado y la canastilla abierta.
   */
  async estadoProducto(db: Db, ctx: AuthContext, productionOrderId: string, productId: string) {
    const order = await db.productionOrder.findFirst({
      where: { id: productionOrderId, plantId: ctx.plantId, deletedAt: null },
      select: { clienteId: true, status: true },
    });
    if (!order) throw new NotFoundException('Orden de producción no encontrada.');
    const cp = await db.clienteProducto.findFirst({
      where: { clienteId: order.clienteId, productId, product: { plantId: ctx.plantId } },
      select: { piezasPorCanal: true, undsPorCaja: true },
    });
    if (!cp) throw new BadRequestException('El producto no está en Piezas Desposte del cliente.');

    const [prep, conteo, abierta, ultimaCerrada] = await Promise.all([
      db.productionOrderTienda.findMany({
        where: { productionOrderId },
        select: { cantidad: true, tienda: { select: { id: true, codigo: true, nombre: true } } },
      }),
      db.rotuladoEtiqueta.groupBy({
        by: ['tiendaId', 'sobrante'],
        where: { productionOrderId, productId, deletedAt: null },
        _count: { _all: true },
      }),
      db.rotuladoCanastilla.findFirst({
        where: { productionOrderId, productId, cerradaAt: null },
        select: canastillaSelect,
      }),
      db.rotuladoCanastilla.findFirst({
        where: { productionOrderId, productId, cerradaAt: { not: null } },
        orderBy: { cerradaAt: 'desc' },
        select: canastillaSelect,
      }),
    ]);
    const contar = (tiendaId: string, sobrante: boolean) =>
      conteo.find((c) => c.tiendaId === tiendaId && c.sobrante === sobrante)?._count._all ?? 0;
    const tiendas = prep
      .sort((a, b) => a.tienda.codigo.localeCompare(b.tienda.codigo, 'es', { numeric: true }))
      .map((p) => ({
        tiendaId: p.tienda.id,
        codigo: p.tienda.codigo,
        nombre: p.tienda.nombre,
        canales: p.cantidad,
        requeridas: p.cantidad * cp.piezasPorCanal,
        etiquetadas: contar(p.tienda.id, false),
        sobrantes: contar(p.tienda.id, true),
      }));
    const siguiente = tiendas.find((t) => t.etiquetadas < t.requeridas) ?? null;
    const faltan = (tiendaId: string) => {
      const t = tiendas.find((x) => x.tiendaId === tiendaId);
      return t ? Math.max(t.requeridas - t.etiquetadas, 0) : 0;
    };
    const canastilla = abierta ? canastillaDto(abierta) : null;
    // La canastilla se llena hasta Unds x caja o hasta lo que aún le falta a su tienda
    // (lo que sea menor); las de sobrantes solo tienen el tope de la caja.
    const capacidadCanastilla =
      canastilla && canastilla.unds > 0
        ? canastilla.sobrantes > 0
          ? cp.undsPorCaja
          : Math.min(cp.undsPorCaja, canastilla.unds + faltan(canastilla.tiendaId))
        : siguiente
          ? Math.min(cp.undsPorCaja, faltan(siguiente.tiendaId))
          : cp.undsPorCaja;
    return {
      activa: order.status === DispatchOrderStatus.activo,
      clienteId: order.clienteId,
      piezasPorCanal: cp.piezasPorCanal,
      undsPorCaja: cp.undsPorCaja,
      capacidadCanastilla,
      tiendas,
      // Las tiendas se llenan en orden de código.
      siguienteTiendaId: siguiente?.tiendaId ?? null,
      canastilla,
      ultimaCanastilla: ultimaCerrada ? canastillaDto(ultimaCerrada) : null,
    };
  }

  estado(ctx: AuthContext, productionOrderId: string, productId: string) {
    return this.estadoProducto(this.prisma, ctx, productionOrderId, productId);
  }

  // Estaciones con Embalaje abierto, por orden (en memoria; se renuevan con latidos).
  private readonly presencias = new Map<
    string,
    Map<string, { productId: string; estacion: string; usuario: string; at: number }>
  >();
  private static readonly PRESENCIA_MS = 45_000;

  registrarPresencia(
    ctx: AuthContext,
    productionOrderId: string,
    dto: { productId: string; estacionId: string; estacion: string; usuario?: string },
  ) {
    const clave = `${ctx.plantId}:${productionOrderId}`;
    const porOrden = this.presencias.get(clave) ?? new Map();
    porOrden.set(dto.estacionId, {
      productId: dto.productId,
      estacion: dto.estacion,
      usuario: dto.usuario ?? '',
      at: Date.now(),
    });
    this.presencias.set(clave, porOrden);
    return { ok: true };
  }

  quitarPresencia(ctx: AuthContext, productionOrderId: string, estacionId: string) {
    this.presencias.get(`${ctx.plantId}:${productionOrderId}`)?.delete(estacionId);
    return { ok: true };
  }

  /**
   * Avance por producto de la orden: si ya completó todas las tiendas, por cuál tienda va
   * y qué estaciones lo tienen abierto ahora.
   */
  async avanceProductos(ctx: AuthContext, productionOrderId: string) {
    const order = await this.prisma.productionOrder.findFirst({
      where: { id: productionOrderId, plantId: ctx.plantId, deletedAt: null },
      select: { clienteId: true },
    });
    if (!order) throw new NotFoundException('Orden de producción no encontrada.');

    const ahora = Date.now();
    const clave = `${ctx.plantId}:${productionOrderId}`;
    const activas = [...(this.presencias.get(clave) ?? new Map()).entries()].filter(
      ([, p]) => ahora - p.at < ProductionOrderService.PRESENCIA_MS,
    );
    this.presencias.set(clave, new Map(activas));

    const [prep, conteo] = await Promise.all([
      this.prisma.productionOrderTienda.findMany({
        where: { productionOrderId },
        select: { cantidad: true, tienda: { select: { id: true, codigo: true, nombre: true } } },
      }),
      this.prisma.rotuladoEtiqueta.groupBy({
        by: ['productId', 'tiendaId'],
        where: { productionOrderId, deletedAt: null, sobrante: false },
        _count: { _all: true },
      }),
    ]);
    prep.sort((a, b) => a.tienda.codigo.localeCompare(b.tienda.codigo, 'es', { numeric: true }));
    const productIds = [
      ...new Set([...conteo.map((c) => c.productId), ...activas.map(([, p]) => p.productId)]),
    ];
    if (!productIds.length) return [];
    const piezas = await this.prisma.clienteProducto.findMany({
      where: { clienteId: order.clienteId, productId: { in: productIds } },
      select: { productId: true, piezasPorCanal: true },
    });

    return piezas.map((p) => {
      const hechas = (tiendaId: string) =>
        conteo.find((c) => c.productId === p.productId && c.tiendaId === tiendaId)?._count._all ??
        0;
      const pendiente = prep.find((t) => hechas(t.tienda.id) < t.cantidad * p.piezasPorCanal);
      return {
        productId: p.productId,
        iniciado: conteo.some((c) => c.productId === p.productId),
        completo: prep.length > 0 && !pendiente,
        tiendaActual: pendiente ? { codigo: pendiente.tienda.codigo, nombre: pendiente.tienda.nombre } : null,
        estaciones: activas
          .filter(([, e]) => e.productId === p.productId)
          .map(([estacionId, e]) => ({ estacionId, estacion: e.estacion, usuario: e.usuario })),
      };
    });
  }

  /** La pieza debe ir a la tienda que toca (o ser sobrante) y caber en la canastilla abierta. */
  private validarDestino(
    estado: EstadoRotulado,
    tiendaId: string,
    sobrante: boolean,
    taraKg?: number,
  ) {
    if (!estado.activa) throw new BadRequestException('La orden de producción no está activa.');
    if (!estado.tiendas.length) {
      throw new BadRequestException('La orden no tiene tiendas preparadas; no se puede despostar.');
    }
    const tienda = estado.tiendas.find((t) => t.tiendaId === tiendaId);
    if (!tienda) throw new BadRequestException('La tienda no está en la preparación de la orden.');
    const siguiente = estado.tiendas.find((t) => t.tiendaId === estado.siguienteTiendaId);
    if (sobrante) {
      if (siguiente) {
        throw new BadRequestException(`Aún faltan piezas para la tienda ${siguiente.codigo}; no es sobrante.`);
      }
    } else if (!siguiente) {
      throw new BadRequestException('Todas las tiendas completaron este producto.');
    } else if (siguiente.tiendaId !== tiendaId) {
      throw new BadRequestException(`Esta pieza le toca a la tienda ${siguiente.codigo}.`);
    }
    const c = estado.canastilla;
    if (c && c.unds > 0) {
      if (c.tiendaId !== tiendaId) {
        throw new BadRequestException(
          `La canastilla N.º ${c.numero} es de la tienda ${c.tiendaCodigo}. Ciérrala antes de seguir.`,
        );
      }
      if (c.unds >= estado.capacidadCanastilla) {
        throw new BadRequestException(
          estado.capacidadCanastilla < estado.undsPorCaja
            ? `La tienda ${c.tiendaCodigo} ya completó su pedido. Cierra la canastilla N.º ${c.numero} con el botón de caja.`
            : `La canastilla N.º ${c.numero} está llena (${c.unds}/${estado.undsPorCaja}). Ciérrala con el botón de caja.`,
        );
      }
      if (
        taraKg !== undefined &&
        c.taraPiezas !== null &&
        Math.abs(taraKg - c.taraPiezas) > 0.001
      ) {
        throw new BadRequestException(
          `La tara de la canastilla N.º ${c.numero} es ${c.taraPiezas.toFixed(2)} kg; todas sus piezas deben llevar la misma tara.`,
        );
      }
    }
  }

  async reservarEtiqueta(
    ctx: AuthContext,
    productionOrderId: string,
    dto: { productId: string; tiendaId: string; sobrante?: boolean; taraKg?: number },
  ) {
    const estado = await this.estadoProducto(this.prisma, ctx, productionOrderId, dto.productId);
    this.validarDestino(estado, dto.tiendaId, dto.sobrante ?? false, dto.taraKg);

    const counter = await this.prisma.rotuladoConsecutivo.upsert({
      where: {
        plantId_productionOrderId_productId: {
          plantId: ctx.plantId,
          productionOrderId,
          productId: dto.productId,
        },
      },
      create: { plantId: ctx.plantId, productionOrderId, productId: dto.productId, ultimo: 1 },
      update: { ultimo: { increment: 1 } },
      select: { ultimo: true },
    });
    return { pieza: counter.ultimo };
  }

  /** Registra una etiqueta impresa; la pieza debe haber sido reservada antes. */
  async guardarEtiqueta(ctx: AuthContext, productionOrderId: string, dto: GuardarEtiquetaDto) {
    const order = await this.prisma.productionOrder.findFirst({
      where: { id: productionOrderId, plantId: ctx.plantId, deletedAt: null },
      select: { clienteId: true },
    });
    if (!order) throw new BadRequestException('La orden de producción no existe.');

    const [bodega, consecutivo] = await Promise.all([
      dto.bodegaId
        ? this.prisma.bodega.findFirst({
            where: { id: dto.bodegaId, clienteId: order.clienteId },
            select: { id: true },
          })
        : Promise.resolve(null),
      this.prisma.rotuladoConsecutivo.findUnique({
        where: {
          plantId_productionOrderId_productId: {
            plantId: ctx.plantId,
            productionOrderId,
            productId: dto.productId,
          },
        },
        select: { ultimo: true },
      }),
    ]);
    if (dto.bodegaId && !bodega) throw new BadRequestException('La bodega no pertenece al cliente de la orden.');
    if (!consecutivo || dto.pieza > consecutivo.ultimo) {
      throw new BadRequestException(`La pieza #${dto.pieza} no fue reservada para este producto.`);
    }

    try {
      const creada = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`rot:${productionOrderId}:${dto.productId}`}))`;
        const estado = await this.estadoProducto(tx, ctx, productionOrderId, dto.productId);
        this.validarDestino(estado, dto.tiendaId, dto.sobrante ?? false, dto.taraKg);

        let canastillaId = estado.canastilla?.id;
        if (canastillaId && estado.canastilla!.tiendaId !== dto.tiendaId) {
          // Canastilla abierta pero vacía: pasa a la tienda que toca.
          await tx.rotuladoCanastilla.update({
            where: { id: canastillaId },
            data: { tiendaId: dto.tiendaId },
          });
        }
        if (!canastillaId) {
          const agg = await tx.rotuladoCanastilla.aggregate({
            _max: { numero: true },
            where: { productionOrderId, productId: dto.productId },
          });
          const nueva = await tx.rotuladoCanastilla.create({
            data: {
              plantId: ctx.plantId,
              productionOrderId,
              productId: dto.productId,
              tiendaId: dto.tiendaId,
              numero: (agg._max.numero ?? 0) + 1,
              createdById: ctx.userId,
            },
            select: { id: true },
          });
          canastillaId = nueva.id;
        }

        return tx.rotuladoEtiqueta.create({
          data: {
            plantId: ctx.plantId,
            productionOrderId,
            productId: dto.productId,
            tiendaId: dto.tiendaId,
            bodegaId: dto.bodegaId ?? null,
            canastillaId,
            sobrante: dto.sobrante ?? false,
            pieza: dto.pieza,
            taraKg: dto.taraKg,
            brutoKg: dto.brutoKg,
            netoKg: dto.netoKg,
            empaque: dto.empaque,
            conservacion: dto.conservacion,
            temperatura: dto.temperatura,
            fechaSacrificio: new Date(dto.fechaSacrificio),
            fechaEmpaque: new Date(dto.fechaEmpaque),
            fechaVencimiento: dto.fechaVencimiento ? new Date(dto.fechaVencimiento) : null,
            ref: dto.ref || null,
            procesadoPara: dto.procesadoPara || null,
            impresa: dto.impresa,
            createdById: ctx.userId,
          },
          select: etiquetaSelect,
        });
      });
      return etiquetaDto(creada);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`La pieza #${dto.pieza} ya está registrada.`);
      }
      throw err;
    }
  }

  /** Cierra la canastilla abierta: guarda unds, neto, tara (la de sus piezas) y bruto (neto + tara). */
  async cerrarCanastilla(ctx: AuthContext, canastillaId: string, taraKg?: number) {
    return this.prisma.$transaction(async (tx) => {
      const actual = await tx.rotuladoCanastilla.findFirst({
        where: { id: canastillaId, plantId: ctx.plantId },
        select: { productionOrderId: true, productId: true },
      });
      if (!actual) throw new NotFoundException('Canastilla no encontrada.');
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`rot:${actual.productionOrderId}:${actual.productId}`}))`;
      const c = await tx.rotuladoCanastilla.findUniqueOrThrow({
        where: { id: canastillaId },
        select: canastillaSelect,
      });
      if (c.cerradaAt) throw new BadRequestException(`La canastilla N.º ${c.numero} ya está cerrada.`);
      const dto = canastillaDto(c);
      if (!dto.unds) throw new BadRequestException('La canastilla está vacía.');
      const tara = dto.taraPiezas ?? 0;
      if (taraKg !== undefined && Math.abs(taraKg - tara) > 0.001) {
        throw new BadRequestException(
          `La tara de la canastilla N.º ${c.numero} es ${tara.toFixed(2)} kg (la de sus piezas).`,
        );
      }
      const cerrada = await tx.rotuladoCanastilla.update({
        where: { id: canastillaId },
        data: {
          unds: dto.unds,
          netoKg: dto.netoKg,
          taraKg: tara,
          brutoKg: Number((dto.netoKg + tara).toFixed(2)),
          cerradaAt: new Date(),
          cerradaById: ctx.userId,
        },
        select: canastillaSelect,
      });
      return canastillaDto(cerrada);
    });
  }

  async listarEtiquetas(ctx: AuthContext, productionOrderId: string, query: QueryEtiquetasDto) {
    const rows = await this.prisma.rotuladoEtiqueta.findMany({
      where: {
        plantId: ctx.plantId,
        productionOrderId,
        productId: query.productId,
        deletedAt: null,
      },
      orderBy: { pieza: 'desc' },
      select: etiquetaSelect,
    });
    return rows.map(etiquetaDto);
  }

  /**
   * Anula la etiqueta (queda en la base con quién y cuándo la borró); la pieza vuelve a quedar
   * pendiente. Si su canastilla ya estaba cerrada, se reabre (hay que confirmarlo con `reabrir`).
   */
  async borrarEtiqueta(ctx: AuthContext, etiquetaId: string, reabrir = false) {
    const etiqueta = await this.prisma.rotuladoEtiqueta.findFirst({
      where: { id: etiquetaId, plantId: ctx.plantId, deletedAt: null },
      select: {
        id: true,
        productionOrderId: true,
        productId: true,
        canastilla: { select: { id: true, numero: true, cerradaAt: true } },
      },
    });
    if (!etiqueta) throw new NotFoundException('Etiqueta no encontrada.');
    const cerrada = etiqueta.canastilla?.cerradaAt ? etiqueta.canastilla : null;
    if (cerrada && !reabrir) {
      throw new ConflictException(
        `La pieza está en la canastilla N.º ${cerrada.numero}, que ya se cerró. Confirma para borrarla y reabrir la canastilla.`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`rot:${etiqueta.productionOrderId}:${etiqueta.productId}`}))`;
      if (cerrada) {
        // Solo puede haber una canastilla abierta por producto.
        const abierta = await tx.rotuladoCanastilla.findFirst({
          where: {
            productionOrderId: etiqueta.productionOrderId,
            productId: etiqueta.productId,
            cerradaAt: null,
          },
          select: { id: true, numero: true, _count: { select: { etiquetas: { where: { deletedAt: null } } } } },
        });
        if (abierta && abierta._count.etiquetas > 0) {
          throw new BadRequestException(
            `La canastilla N.º ${abierta.numero} está abierta. Ciérrala antes de reabrir la N.º ${cerrada.numero}.`,
          );
        }
        if (abierta) await tx.rotuladoCanastilla.delete({ where: { id: abierta.id } });
        await tx.rotuladoCanastilla.update({
          where: { id: cerrada.id },
          data: {
            cerradaAt: null,
            cerradaById: null,
            unds: null,
            netoKg: null,
            taraKg: null,
            brutoKg: null,
          },
        });
      }
      await tx.rotuladoEtiqueta.update({
        where: { id: etiquetaId },
        data: { deletedAt: new Date(), deletedById: ctx.userId },
      });
    });
    return { ok: true };
  }

  // ---- Preparar orden: distribución de canales por tienda ----

  private async ordenPreparacion(ctx: AuthContext, id: string) {
    const op = await this.prisma.productionOrder.findFirst({
      where: { id, plantId: ctx.plantId, deletedAt: null },
      select: {
        id: true,
        clienteId: true,
        dispatchOrder: {
          select: { items: { select: { canalPieza: { select: { pieza: true, eventoId: true } } } } },
        },
      },
    });
    if (!op) throw new NotFoundException('Orden de producción no encontrada.');
    // Media izq + der del mismo animal cuentan como una canal.
    const totalCanales = agruparCanales(
      op.dispatchOrder.items.map((i) => ({ ...i.canalPieza, kg: 0 })),
    ).total;
    return { id: op.id, clienteId: op.clienteId, totalCanales };
  }

  /** Total de canales (piezas despachadas en su OD) y lo ya repartido por tienda. */
  async preparacion(ctx: AuthContext, id: string) {
    const op = await this.ordenPreparacion(ctx, id);
    const filas = await this.prisma.productionOrderTienda.findMany({
      where: { productionOrderId: op.id },
      select: {
        id: true,
        cantidad: true,
        tienda: { select: { id: true, codigo: true, nombre: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const asignadas = filas.reduce((a, f) => a + f.cantidad, 0);
    const totalCanales = op.totalCanales;
    return {
      totalCanales,
      asignadas,
      disponibles: Math.max(totalCanales - asignadas, 0),
      tiendas: filas.map((f) => ({
        id: f.id,
        tiendaId: f.tienda.id,
        codigo: f.tienda.codigo,
        nombre: f.tienda.nombre,
        cantidad: f.cantidad,
      })),
    };
  }

  /** Asigna (o reemplaza) la cantidad de canales de una tienda sin pasarse del total. */
  async asignarTienda(ctx: AuthContext, id: string, dto: AsignarTiendaDto) {
    const op = await this.ordenPreparacion(ctx, id);
    const tienda = await this.prisma.clienteTienda.findFirst({
      where: { id: dto.tiendaId, clienteId: op.clienteId, active: true },
      select: { id: true },
    });
    if (!tienda) throw new BadRequestException('La tienda no pertenece al cliente de la orden.');

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`prep:${op.id}`}))`;
      const agg = await tx.productionOrderTienda.aggregate({
        _sum: { cantidad: true },
        where: { productionOrderId: op.id, tiendaId: { not: dto.tiendaId } },
      });
      const otras = agg._sum.cantidad ?? 0;
      const total = op.totalCanales;
      if (otras + dto.cantidad > total) {
        throw new BadRequestException(
          `Solo quedan ${Math.max(total - otras, 0)} canales por repartir (total ${total}).`,
        );
      }
      await tx.productionOrderTienda.upsert({
        where: { productionOrderId_tiendaId: { productionOrderId: op.id, tiendaId: dto.tiendaId } },
        create: {
          productionOrderId: op.id,
          tiendaId: dto.tiendaId,
          cantidad: dto.cantidad,
          createdById: ctx.userId,
        },
        update: { cantidad: dto.cantidad },
      });
    });
    return this.preparacion(ctx, id);
  }

  async quitarTienda(ctx: AuthContext, filaId: string) {
    const fila = await this.prisma.productionOrderTienda.findFirst({
      where: { id: filaId, productionOrder: { plantId: ctx.plantId } },
      select: { id: true, productionOrderId: true },
    });
    if (!fila) throw new NotFoundException('Distribución no encontrada.');
    await this.prisma.productionOrderTienda.delete({ where: { id: fila.id } });
    return this.preparacion(ctx, fila.productionOrderId);
  }

  async findAll(ctx: AuthContext, query: QueryProductionOrderDto) {
    const where: Prisma.ProductionOrderWhereInput = {
      plantId: ctx.plantId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.fecha ? { processDate: new Date(query.fecha) } : {}),
    };
    const [total, data] = await this.prisma.$transaction([
      this.prisma.productionOrder.count({ where }),
      this.prisma.productionOrder.findMany({
        where,
        orderBy: { opNumber: 'desc' },
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

  async findOne(ctx: AuthContext, id: string) {
    const order = await this.prisma.productionOrder.findFirst({
      where: { id, plantId: ctx.plantId, deletedAt: null },
      include,
    });
    if (!order) throw new NotFoundException('Orden de producción no encontrada.');
    return order;
  }
}
