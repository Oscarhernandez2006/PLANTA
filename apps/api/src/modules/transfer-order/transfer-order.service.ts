import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DispatchOrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizarCodigoBarras, tipoCodigoBarras } from '../../common/codigo-barras';
import type { AuthContext } from '../../common/auth/auth-context';
import { verificarPinSupervisor } from '../../common/auth/supervisor-pin';
import { PLANT_DAY_CUTOFF_HOUR, plantDateOnly } from '../../common/plant-date';
import { advertenciaAntiguedad } from '../inventarios/advertencia-antiguedad';
import { validarEnPicking } from '../picking/validar-picking';
import { exigirSinArrumeAbierto, reabrirArrumeAlQuitar } from '../picking/arrume';
import { exigirPreordenesCompletas } from '../picking/preordenes-completas';
import {
  AnularTransferOrderDto,
  CreateTransferOrderDto,
  QueryTransferOrderDto,
  RegistrarTrasladoDto,
  UpdateTransferOrderDto,
} from './transfer-order.dto';

/** Inicio de la jornada de hoy (5:00 a. m. en Colombia, UTC-5). */
const inicioJornada = () => new Date(plantDateOnly().getTime() + (PLANT_DAY_CUTOFF_HOUR + 5) * 3_600_000);

const clienteSelect = {
  select: { id: true, nit: true, concepto: true },
} as const;

const formatOT = (n: number) => `OT${n}`;

const trasladoSelect = { select: { transferOrder: { select: { otNumber: true } } } } as const;
const despachoSelect = { select: { canalDispatchOrder: { select: { dcNumber: true } } } } as const;
const despachada = (dcNumber: number) => `ya fue despachada en la orden DC${dcNumber}`;

type Db = Prisma.TransactionClient;
type OrdenTraslado = { id: string; otNumber: number; clienteId: string; status: DispatchOrderStatus };

@Injectable()
export class TransferOrderService {
  constructor(private readonly prisma: PrismaService) {}

  /** Próximo número de O.T. (solo previsualización; el definitivo se asigna al guardar). */
  async nextNumber(ctx: AuthContext) {
    const agg = await this.prisma.transferOrder.aggregate({
      _max: { otNumber: true },
      where: { plantId: ctx.plantId },
    });
    return { next: (agg._max.otNumber ?? 0) + 1 };
  }

  async create(ctx: AuthContext, dto: CreateTransferOrderDto) {
    const cliente = await this.prisma.cliente.findFirst({
      where: { id: dto.clienteId, active: true },
      select: { id: true },
    });
    if (!cliente) throw new BadRequestException('El cliente no existe o está inactivo.');

    return this.prisma.$transaction(async (tx) => {
      // Serializa la numeración por planta.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${ctx.plantId}:ot`}))`;
      const agg = await tx.transferOrder.aggregate({
        _max: { otNumber: true },
        where: { plantId: ctx.plantId },
      });
      return tx.transferOrder.create({
        data: {
          plantId: ctx.plantId,
          otNumber: (agg._max.otNumber ?? 0) + 1,
          registrationDate: new Date(dto.registrationDate),
          processDate: new Date(dto.processDate),
          clienteId: dto.clienteId,
          status: dto.status ?? DispatchOrderStatus.activo,
          createdById: ctx.userId,
        },
        include: { cliente: clienteSelect },
      });
    });
  }

  async findAll(ctx: AuthContext, query: QueryTransferOrderDto) {
    const q = query.search?.trim();
    const numero = q ? Number(q.toUpperCase().replace(/^OT/, '')) : NaN;
    const base: Prisma.TransferOrderWhereInput = {
      plantId: ctx.plantId,
      ...(query.desde || query.hasta
        ? {
            processDate: {
              ...(query.desde ? { gte: new Date(query.desde) } : {}),
              ...(query.hasta ? { lte: new Date(query.hasta) } : {}),
            },
          }
        : {}),
      ...(q
        ? {
            OR: [
              ...(Number.isInteger(numero) && numero > 0 ? [{ otNumber: numero }] : []),
              { cliente: { concepto: { contains: q, mode: 'insensitive' as const } } },
              { cliente: { nit: { contains: q } } },
            ],
          }
        : {}),
    };
    const estado = query.estado ?? query.status;
    const where: Prisma.TransferOrderWhereInput =
      estado === 'anulada'
        ? { ...base, deletedAt: { not: null } }
        : { ...base, deletedAt: null, ...(estado ? { status: estado } : {}) };
    const [total, data, porEstado, anuladas, cerradasHoy] = await this.prisma.$transaction([
      this.prisma.transferOrder.count({ where }),
      this.prisma.transferOrder.findMany({
        where,
        orderBy: { otNumber: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          cliente: clienteSelect,
          createdBy: { select: { fullName: true } },
          conditioningOrders: { where: { deletedAt: null }, select: { ocNumber: true } },
        },
      }),
      this.prisma.transferOrder.groupBy({
        by: ['status'],
        where: { ...base, deletedAt: null },
        orderBy: { status: 'asc' },
        _count: { _all: true },
      }),
      this.prisma.transferOrder.count({ where: { ...base, deletedAt: { not: null } } }),
      this.prisma.transferOrder.count({
        where: { plantId: ctx.plantId, deletedAt: null, closedAt: { gte: inicioJornada() } },
      }),
    ]);
    const totales = data.length
      ? await this.prisma.transferOrderItem.groupBy({
          by: ['transferOrderId'],
          where: { transferOrderId: { in: data.map((o) => o.id) } },
          _count: { _all: true },
          _sum: { netoKg: true, unds: true },
          orderBy: { transferOrderId: 'asc' },
        })
      : [];
    const porOrden = new Map(totales.map((t) => [t.transferOrderId, t]));
    const conteo = (s: DispatchOrderStatus) =>
      (porEstado.find((p) => p.status === s)?._count as { _all: number } | undefined)?._all ?? 0;
    return {
      data: data.map(({ createdBy, conditioningOrders, ...o }) => {
        const t = porOrden.get(o.id);
        return {
          ...o,
          creadaPor: createdBy.fullName,
          ocNumbers: conditioningOrders.map((c) => c.ocNumber),
          empaques: t?._count._all ?? 0,
          unds: t?._sum.unds ?? 0,
          netoKg: Number(t?._sum.netoKg ?? 0),
        };
      }),
      resumen: {
        activas: conteo(DispatchOrderStatus.activo),
        inactivas: conteo(DispatchOrderStatus.inactivo),
        cerradas: conteo(DispatchOrderStatus.facturado),
        anuladas,
        cerradasHoy,
      },
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  /** Hoja de la orden: encabezado, quién la creó/cerró/anuló, productos y órdenes de acondicionamiento. */
  async detalle(ctx: AuthContext, id: string) {
    const o = await this.prisma.transferOrder.findFirst({
      where: { id, plantId: ctx.plantId },
      include: {
        cliente: clienteSelect,
        conditioningOrders: {
          where: { deletedAt: null },
          select: { id: true, ocNumber: true, status: true, processDate: true },
          orderBy: { ocNumber: 'asc' },
        },
        items: { orderBy: { createdAt: 'desc' }, select: itemSelect },
      },
    });
    if (!o) throw new NotFoundException('Orden de traslado no encontrada.');
    const ids = [o.createdById, o.closedById, o.deletedById].filter((x): x is string => !!x);
    const usuarios = await this.prisma.appUser.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } });
    const nombre = (uid: string | null) => (uid ? (usuarios.find((u) => u.id === uid)?.fullName ?? '—') : null);
    const { items, conditioningOrders, ...orden } = o;
    return {
      ...orden,
      creadaPor: nombre(o.createdById),
      cerradaPor: nombre(o.closedById),
      anuladaPor: nombre(o.deletedById),
      items: items.map(itemDto),
      ordenesAcondicionamiento: conditioningOrders.map((c) => ({
        ...c,
        processDate: c.processDate.toISOString().slice(0, 10),
      })),
    };
  }

  /** Cambia fecha de proceso, estado (activa/inactiva) o cliente (solo si aún no tiene productos). */
  async actualizar(ctx: AuthContext, id: string, dto: UpdateTransferOrderDto) {
    const ot = await this.orden(ctx, id);
    if (ot.status === DispatchOrderStatus.facturado) {
      throw new BadRequestException('La orden está cerrada: para modificarla primero hay que reabrirla.');
    }
    if (dto.clienteId && dto.clienteId !== ot.clienteId) {
      const items = await this.prisma.transferOrderItem.count({ where: { transferOrderId: id } });
      if (items) throw new BadRequestException('No se puede cambiar el cliente: la orden ya tiene productos registrados.');
      const cliente = await this.prisma.cliente.findFirst({ where: { id: dto.clienteId, active: true }, select: { id: true } });
      if (!cliente) throw new BadRequestException('El cliente no existe o está inactivo.');
    }
    await this.prisma.transferOrder.update({
      where: { id },
      data: {
        ...(dto.clienteId ? { clienteId: dto.clienteId } : {}),
        ...(dto.processDate ? { processDate: new Date(dto.processDate) } : {}),
        ...(dto.status ? { status: dto.status } : {}),
      },
    });
    return { ok: true };
  }

  /** Anula la orden (con motivo y PIN de supervisor). Solo si no tiene productos ni acondicionamientos. */
  async anular(ctx: AuthContext, id: string, dto: AnularTransferOrderDto) {
    const ot = await this.orden(ctx, id);
    const supervisorId = await verificarPinSupervisor(this.prisma, ctx.plantId, dto.pin);
    const [items, ocs] = await Promise.all([
      this.prisma.transferOrderItem.count({ where: { transferOrderId: id } }),
      this.prisma.conditioningOrder.count({ where: { transferOrderId: id, deletedAt: null } }),
    ]);
    if (items) throw new BadRequestException(`La orden ${formatOT(ot.otNumber)} tiene ${items} producto(s): quítalos antes de anularla.`);
    if (ocs) throw new BadRequestException('La orden tiene órdenes de acondicionamiento: no se puede anular.');
    await this.prisma.transferOrder.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedById: supervisorId,
        motivoAnulacion: dto.motivo.trim(),
        status: DispatchOrderStatus.inactivo,
      },
    });
    return { ok: true };
  }

  /** Reabre una orden cerrada (PIN de supervisor) si aún no se acondicionó. */
  async reabrir(ctx: AuthContext, id: string, pin: string) {
    const ot = await this.orden(ctx, id);
    if (ot.status !== DispatchOrderStatus.facturado) throw new BadRequestException('La orden no está cerrada.');
    await verificarPinSupervisor(this.prisma, ctx.plantId, pin);
    const ocs = await this.prisma.conditioningOrder.count({ where: { transferOrderId: id, deletedAt: null } });
    if (ocs) throw new BadRequestException('La orden ya tiene órdenes de acondicionamiento: no se puede reabrir.');
    await this.prisma.transferOrder.update({
      where: { id },
      data: { status: DispatchOrderStatus.activo, closedAt: null, closedById: null },
    });
    return { ok: true };
  }

  // ---- Traslado: productos de Rotulado que pasan a proceso ----

  private async orden(ctx: AuthContext, id: string): Promise<OrdenTraslado> {
    const ot = await this.prisma.transferOrder.findFirst({
      where: { id, plantId: ctx.plantId, deletedAt: null },
      select: { id: true, otNumber: true, clienteId: true, status: true },
    });
    if (!ot) throw new NotFoundException('Orden de traslado no encontrada.');
    return ot;
  }

  /**
   * Etiqueta de pieza o canastilla (cerrada) por su código de barras, validando que sea del
   * cliente de la orden y que no est\u00e9 ya trasladada (ni ella ni su canastilla o sus piezas).
   */
  private async resolverEtiqueta(db: Db, ctx: AuthContext, ot: OrdenTraslado, codigo: string) {
    const valor = normalizarCodigoBarras(codigo);
    const ordenSelect = { select: { clienteId: true } } as const;
    const ya = (otNumber: number) => `ya est\u00e1 en la orden de traslado ${formatOT(otNumber)}`;
    const tipo = await tipoCodigoBarras(db, ctx.plantId, valor);
    if (tipo === 'acondicionamiento') {
      throw new BadRequestException('Ese código es de una etiqueta de Acondicionamiento; no se traslada.');
    }

    if (tipo === 'canastilla') {
      const c = await db.rotuladoCanastilla.findFirst({
        where: { codigo: valor, plantId: ctx.plantId },
        select: {
          id: true,
          numero: true,
          cerradaAt: true,
          productId: true,
          unds: true,
          netoKg: true,
          productionOrder: ordenSelect,
          traslado: trasladoSelect,
          despacho: despachoSelect,
          etiquetas: {
            where: { deletedAt: null, traslado: { isNot: null } },
            select: { pieza: true, traslado: trasladoSelect },
            take: 1,
          },
          _count: { select: { etiquetas: { where: { deletedAt: null, despacho: { isNot: null } } } } },
        },
      });
      if (!c) throw new NotFoundException(`No se encontr\u00f3 la canastilla ${valor}.`);
      if (!c.cerradaAt) throw new BadRequestException(`La canastilla N.\u00ba ${c.numero} a\u00fan no est\u00e1 cerrada.`);
      if (c.productionOrder.clienteId !== ot.clienteId) {
        throw new BadRequestException('La canastilla es de otro cliente.');
      }
      if (c.despacho) throw new ConflictException(`La canastilla ${despachada(c.despacho.canalDispatchOrder.dcNumber)}.`);
      if (c._count.etiquetas > 0) throw new ConflictException('Una pieza de esta canastilla ya fue despachada.');
      if (c.traslado) throw new ConflictException(`La canastilla ${ya(c.traslado.transferOrder.otNumber)}.`);
      const pieza = c.etiquetas[0];
      if (pieza?.traslado) {
        throw new ConflictException(
          `La pieza #${pieza.pieza} de esta canastilla ${ya(pieza.traslado.transferOrder.otNumber)}.`,
        );
      }
      const product = await db.product.findUniqueOrThrow({
        where: { id: c.productId },
        select: { codigo: true, nombre: true },
      });
      return {
        tipo: 'canastilla' as const,
        etiquetaId: null,
        canastillaId: c.id,
        codigo: valor,
        productId: c.productId,
        productoCodigo: product.codigo,
        productoNombre: product.nombre,
        pieza: null,
        canastillaNumero: c.numero,
        unds: c.unds ?? 0,
        netoEtiquetaKg: Number(c.netoKg ?? 0),
      };
    }

    const e = await db.rotuladoEtiqueta.findFirst({
      where: { codigo: valor, plantId: ctx.plantId, deletedAt: null },
      select: {
        id: true,
        pieza: true,
        netoKg: true,
        productId: true,
        productionOrder: ordenSelect,
        traslado: trasladoSelect,
        despacho: despachoSelect,
        canastilla: { select: { numero: true, traslado: trasladoSelect, despacho: despachoSelect } },
        product: { select: { codigo: true, nombre: true } },
      },
    });
    if (!e) throw new NotFoundException(`No se encontr\u00f3 la etiqueta ${valor} (o fue borrada).`);
    if (e.productionOrder.clienteId !== ot.clienteId) {
      throw new BadRequestException('La etiqueta es de otro cliente.');
    }
    if (e.despacho) throw new ConflictException(`La pieza #${e.pieza} ${despachada(e.despacho.canalDispatchOrder.dcNumber)}.`);
    if (e.canastilla?.despacho) {
      throw new ConflictException(
        `La pieza #${e.pieza} va en la canastilla N.\u00ba ${e.canastilla.numero}, que ${despachada(e.canastilla.despacho.canalDispatchOrder.dcNumber)}.`,
      );
    }
    if (e.traslado) throw new ConflictException(`La pieza #${e.pieza} ${ya(e.traslado.transferOrder.otNumber)}.`);
    if (e.canastilla?.traslado) {
      throw new ConflictException(
        `La pieza #${e.pieza} va en la canastilla N.\u00ba ${e.canastilla.numero}, que ${ya(e.canastilla.traslado.transferOrder.otNumber)}.`,
      );
    }
    return {
      tipo: 'pieza' as const,
      etiquetaId: e.id,
      canastillaId: null,
      codigo: valor,
      productId: e.productId,
      productoCodigo: e.product.codigo,
      productoNombre: e.product.nombre,
      pieza: e.pieza,
      canastillaNumero: e.canastilla?.numero ?? null,
      unds: 1,
      netoEtiquetaKg: Number(e.netoKg),
    };
  }

  async buscarEtiqueta(ctx: AuthContext, otId: string, codigo: string) {
    const ot = await this.orden(ctx, otId);
    const info = await this.resolverEtiqueta(this.prisma, ctx, ot, codigo);
    return { ...info, advertenciaInventario: await advertenciaAntiguedad(this.prisma, ctx.plantId, ot.clienteId, info) };
  }

  /** Lectura en el registro: además exige que la etiqueta esté en el picking (o el PIN del supervisor). */
  async buscarParaRegistro(ctx: AuthContext, otId: string, codigo: string, pin?: string) {
    const info = await this.buscarEtiqueta(ctx, otId, codigo);
    await validarEnPicking(this.prisma, this.prisma, ctx.plantId, { transferOrderId: otId }, info.codigo, pin);
    return info;
  }

  /** Registra el producto en la orden con el peso nuevo (neto = peso - tara). */
  async registrar(ctx: AuthContext, otId: string, dto: RegistrarTrasladoDto) {
    const [item] = await this.registrarVarios(ctx, otId, [dto], { validarPicking: true });
    return item;
  }

  /** Registra varios productos en una sola transacci\u00f3n (todo o nada), p. ej. un arrume pesado junto. */
  async registrarVarios(
    ctx: AuthContext,
    otId: string,
    lineas: RegistrarTrasladoDto[],
    opciones: { validarPicking?: boolean; arrumeId?: string } = {},
  ) {
    const ot = await this.orden(ctx, otId);
    if (ot.status !== DispatchOrderStatus.activo) {
      throw new BadRequestException('La orden de traslado no est\u00e1 activa.');
    }
    const netos = lineas.map((l) => {
      const neto = Number((l.pesoKg - l.taraKg).toFixed(2));
      if (neto <= 0) throw new BadRequestException(`El peso neto de ${l.codigo} debe ser mayor que cero.`);
      return neto;
    });

    let actual = '';
    try {
      const items = await this.prisma.$transaction(
        async (tx) => {
          // Una pieza y su canastilla no pueden trasladarse a la vez desde dos estaciones.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`traslado:${ctx.plantId}`}))`;
          const creados = [];
          for (const [i, l] of lineas.entries()) {
            actual = l.codigo;
            const info = await this.resolverEtiqueta(tx, ctx, ot, l.codigo);
            if (opciones.validarPicking) {
              await validarEnPicking(tx, this.prisma, ctx.plantId, { transferOrderId: ot.id }, info.codigo, l.pin);
            }
            creados.push(
              await tx.transferOrderItem.create({
                data: {
                  transferOrderId: ot.id,
                  etiquetaId: info.etiquetaId,
                  canastillaId: info.canastillaId,
                  codigo: info.codigo,
                  productId: info.productId,
                  unds: info.unds,
                  pesoKg: l.pesoKg,
                  taraKg: l.taraKg,
                  netoKg: netos[i],
                  netoEtiquetaKg: info.netoEtiquetaKg,
                  arrumeId: opciones.arrumeId ?? null,
                  createdById: ctx.userId,
                },
                select: itemSelect,
              }),
            );
          }
          return creados;
        },
        { timeout: 60000 },
      );
      return items.map(itemDto);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`El c\u00f3digo ${actual} ya fue trasladado.`);
      }
      throw err;
    }
  }

  async items(ctx: AuthContext, otId: string) {
    await this.orden(ctx, otId);
    const rows = await this.prisma.transferOrderItem.findMany({
      where: { transferOrderId: otId },
      orderBy: { createdAt: 'desc' },
      select: itemSelect,
    });
    return rows.map(itemDto);
  }

  async quitar(ctx: AuthContext, itemId: string) {
    const item = await this.prisma.transferOrderItem.findFirst({
      where: { id: itemId, transferOrder: { plantId: ctx.plantId, deletedAt: null } },
      select: { id: true, arrumeId: true, transferOrderId: true, transferOrder: { select: { status: true } } },
    });
    if (!item) throw new NotFoundException('Registro no encontrado.');
    if (item.transferOrder.status !== DispatchOrderStatus.activo) {
      throw new BadRequestException('La orden de traslado no est\u00e1 activa.');
    }
    await this.prisma.$transaction(async (tx) => {
      await reabrirArrumeAlQuitar(tx, item.arrumeId, { transferOrderId: item.transferOrderId });
      await tx.transferOrderItem.delete({ where: { id: item.id } });
    });
    return { ok: true };
  }

  /** Cierra la orden: queda finalizada y sale de la lista de \u00f3rdenes por trasladar. */
  async cerrar(ctx: AuthContext, otId: string, pin?: string) {
    const ot = await this.orden(ctx, otId);
    if (ot.status !== DispatchOrderStatus.activo) {
      throw new BadRequestException('La orden de traslado no est\u00e1 activa.');
    }
    await exigirSinArrumeAbierto(this.prisma, { transferOrderId: ot.id });
    await exigirPreordenesCompletas(this.prisma, ctx.plantId, { transferOrderId: ot.id }, pin);
    await this.prisma.transferOrder.update({
      where: { id: ot.id },
      data: { status: DispatchOrderStatus.facturado, closedAt: new Date(), closedById: ctx.userId },
    });
    return { ok: true };
  }
}

const itemSelect = {
  id: true,
  codigo: true,
  etiquetaId: true,
  unds: true,
  pesoKg: true,
  taraKg: true,
  netoKg: true,
  netoEtiquetaKg: true,
  createdAt: true,
  product: { select: { codigo: true, nombre: true } },
} as const;

const itemDto = (i: Prisma.TransferOrderItemGetPayload<{ select: typeof itemSelect }>) => ({
  id: i.id,
  codigo: i.codigo,
  tipo: i.etiquetaId ? ('pieza' as const) : ('canastilla' as const),
  productoCodigo: i.product.codigo,
  productoNombre: i.product.nombre,
  unds: i.unds,
  pesoKg: Number(i.pesoKg),
  taraKg: Number(i.taraKg),
  netoKg: Number(i.netoKg),
  netoEtiquetaKg: Number(i.netoEtiquetaKg),
  createdAt: i.createdAt.toISOString(),
});
