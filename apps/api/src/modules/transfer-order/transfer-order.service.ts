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
  CreateTransferOrderDto,
  QueryTransferOrderDto,
  RegistrarTrasladoDto,
} from './transfer-order.dto';

const clienteSelect = {
  select: { id: true, nit: true, concepto: true },
} as const;

const formatOT = (n: number) => `OT${String(n).padStart(7, '0')}`;

const trasladoSelect = { select: { transferOrder: { select: { otNumber: true } } } } as const;
const despachoSelect = { select: { canalDispatchOrder: { select: { dcNumber: true } } } } as const;
const despachada = (dcNumber: number) => `ya fue despachada en la orden DC${String(dcNumber).padStart(7, '0')}`;

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
    const where: Prisma.TransferOrderWhereInput = {
      plantId: ctx.plantId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
    };
    const [total, data] = await this.prisma.$transaction([
      this.prisma.transferOrder.count({ where }),
      this.prisma.transferOrder.findMany({
        where,
        orderBy: { otNumber: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { cliente: clienteSelect },
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
    const valor = codigo.trim().toUpperCase();
    const ordenSelect = { select: { clienteId: true } } as const;
    const ya = (otNumber: number) => `ya est\u00e1 en la orden de traslado ${formatOT(otNumber)}`;

    if (valor.includes('C')) {
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
    return this.resolverEtiqueta(this.prisma, ctx, ot, codigo);
  }

  /** Registra el producto en la orden con el peso nuevo (neto = peso - tara). */
  async registrar(ctx: AuthContext, otId: string, dto: RegistrarTrasladoDto) {
    const ot = await this.orden(ctx, otId);
    if (ot.status !== DispatchOrderStatus.activo) {
      throw new BadRequestException('La orden de traslado no est\u00e1 activa.');
    }
    const neto = Number((dto.pesoKg - dto.taraKg).toFixed(2));
    if (neto <= 0) throw new BadRequestException('El peso neto debe ser mayor que cero.');

    try {
      const item = await this.prisma.$transaction(async (tx) => {
        // Una pieza y su canastilla no pueden trasladarse a la vez desde dos estaciones.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`traslado:${ctx.plantId}`}))`;
        const info = await this.resolverEtiqueta(tx, ctx, ot, dto.codigo);
        return tx.transferOrderItem.create({
          data: {
            transferOrderId: ot.id,
            etiquetaId: info.etiquetaId,
            canastillaId: info.canastillaId,
            codigo: info.codigo,
            productId: info.productId,
            unds: info.unds,
            pesoKg: dto.pesoKg,
            taraKg: dto.taraKg,
            netoKg: neto,
            netoEtiquetaKg: info.netoEtiquetaKg,
            createdById: ctx.userId,
          },
          select: itemSelect,
        });
      });
      return itemDto(item);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`El c\u00f3digo ${dto.codigo} ya fue trasladado.`);
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
      select: { id: true, transferOrder: { select: { status: true } } },
    });
    if (!item) throw new NotFoundException('Registro no encontrado.');
    if (item.transferOrder.status !== DispatchOrderStatus.activo) {
      throw new BadRequestException('La orden de traslado no est\u00e1 activa.');
    }
    await this.prisma.transferOrderItem.delete({ where: { id: item.id } });
    return { ok: true };
  }

  /** Cierra la orden: queda finalizada y sale de la lista de \u00f3rdenes por trasladar. */
  async cerrar(ctx: AuthContext, otId: string) {
    const ot = await this.orden(ctx, otId);
    if (ot.status !== DispatchOrderStatus.activo) {
      throw new BadRequestException('La orden de traslado no est\u00e1 activa.');
    }
    await this.prisma.transferOrder.update({
      where: { id: ot.id },
      data: { status: DispatchOrderStatus.facturado },
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
