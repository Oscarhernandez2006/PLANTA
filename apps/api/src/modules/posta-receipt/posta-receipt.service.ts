import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DispatchOrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthContext } from '../../common/auth/auth-context';
import { verificarPinSupervisor } from '../../common/auth/supervisor-pin';
import { CreatePostaReceiptDto } from './dto/create-posta-receipt.dto';
import { CreatePostaReceiptItemDto } from './dto/create-posta-receipt-item.dto';
import { QueryPostaReceiptDto } from './dto/query-posta-receipt.dto';
import { bodegaParaCerrar, destinoRecibo } from '../canal-receipt/recibo-destino';

const clientSelect = {
  select: { id: true, nit: true, concepto: true },
} as const;
const bodegaSelect = { select: { id: true, code: true, nombre: true } } as const;

@Injectable()
export class PostaReceiptService {
  constructor(private readonly prisma: PrismaService) {}

  /** Próximo número de recibo (solo previsualización; el definitivo se asigna al guardar). */
  async nextNumber(ctx: AuthContext) {
    const agg = await this.prisma.postaReceiptOrder.aggregate({
      _max: { receiptNumber: true },
      where: { plantId: ctx.plantId },
    });
    return { next: (agg._max.receiptNumber ?? 0) + 1 };
  }

  async create(ctx: AuthContext, dto: CreatePostaReceiptDto) {
    const cliente = await this.prisma.cliente.findFirst({
      where: { id: dto.clienteId, active: true },
      select: { id: true },
    });
    if (!cliente) throw new BadRequestException('El cliente no existe o está inactivo. Créalo primero en Clientes.');
    return this.prisma.$transaction(async (tx) => {
      // Serializa la numeración por planta.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${ctx.plantId}:posta-receipt`}))`;
      const agg = await tx.postaReceiptOrder.aggregate({
        _max: { receiptNumber: true },
        where: { plantId: ctx.plantId },
      });
      const receiptNumber = (agg._max.receiptNumber ?? 0) + 1;

      return tx.postaReceiptOrder.create({
        data: {
          plantId: ctx.plantId,
          receiptNumber,
          registrationDate: new Date(dto.registrationDate),
          processDate: new Date(dto.processDate),
          clienteId: dto.clienteId,
          status: dto.status ?? DispatchOrderStatus.activo,
          createdById: ctx.userId,
        },
        include: { cliente: clientSelect, bodega: bodegaSelect },
      });
    });
  }

  async findAll(ctx: AuthContext, query: QueryPostaReceiptDto) {
    const where: Prisma.PostaReceiptOrderWhereInput = {
      plantId: ctx.plantId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.postaReceiptOrder.count({ where }),
      this.prisma.postaReceiptOrder.findMany({
        where,
        orderBy: { receiptNumber: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          cliente: clientSelect,
          bodega: bodegaSelect,
          items: { select: { netoKg: true, piezas: true, productId: true } },
        },
      }),
    ]);
    // Resumen por orden: registros (pesadas), piezas, referencias y kilos netos.
    const data = rows.map(({ items, ...o }) => ({
      ...o,
      registros: items.length,
      piezas: items.reduce((s, i) => s + i.piezas, 0),
      referencias: new Set(items.map((i) => i.productId)).size,
      kg: Math.round(items.reduce((s, i) => s + Number(i.netoKg), 0) * 100) / 100,
    }));

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
    const order = await this.prisma.postaReceiptOrder.findFirst({
      where: { id, plantId: ctx.plantId, deletedAt: null },
      include: { cliente: clientSelect, bodega: bodegaSelect },
    });
    if (!order) throw new NotFoundException('Recibo en posta no encontrado.');
    return order;
  }

  // ---- Animales pesados (items) de una orden de recibo en posta ----

  async items(ctx: AuthContext, orderId: string) {
    await this.findOne(ctx, orderId);
    return this.prisma.postaReceiptItem.findMany({
      where: { receiptOrderId: orderId },
      include: { product: { select: { id: true, codigo: true, nombre: true } } },
      orderBy: { codigo: 'asc' },
    });
  }

  async addItem(
    ctx: AuthContext,
    orderId: string,
    dto: CreatePostaReceiptItemDto,
  ) {
    const order = await this.findOne(ctx, orderId);
    if (order.status !== DispatchOrderStatus.activo) {
      throw new BadRequestException('La orden de recibo está cerrada: no recibe más producto.');
    }
    const netoKg = Math.round((dto.brutoKg - dto.taraKg) * 100) / 100;
    if (netoKg <= 0) throw new BadRequestException('El peso bruto debe ser mayor que la tara.');
    const producto = await this.prisma.product.findFirst({
      where: { id: dto.productId, plantId: ctx.plantId },
      select: { id: true },
    });
    if (!producto) throw new BadRequestException('Producto no encontrado.');
    if (
      dto.fechaSacrificio &&
      dto.fechaVencimiento &&
      dto.fechaVencimiento.slice(0, 10) < dto.fechaSacrificio.slice(0, 10)
    ) {
      throw new BadRequestException('El vencimiento no puede ser anterior al sacrificio.');
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${orderId}:posta-item`}))`;
      const agg = await tx.postaReceiptItem.aggregate({
        _max: { codigo: true },
        where: { receiptOrderId: orderId },
      });
      const codigo = (agg._max.codigo ?? 0) + 1;
      return tx.postaReceiptItem.create({
        data: {
          receiptOrderId: orderId,
          plantId: ctx.plantId,
          codigo,
          productId: dto.productId,
          taraKg: new Prisma.Decimal(dto.taraKg),
          brutoKg: new Prisma.Decimal(dto.brutoKg),
          netoKg: new Prisma.Decimal(netoKg),
          piezas: dto.piezas,
          empaques: dto.empaques,
          lote: dto.lote.trim(),
          conservacion: dto.conservacion,
          fechaSacrificio: dto.fechaSacrificio ? new Date(dto.fechaSacrificio.slice(0, 10)) : null,
          fechaVencimiento: dto.fechaVencimiento ? new Date(dto.fechaVencimiento.slice(0, 10)) : null,
          createdById: ctx.userId,
        },
        include: { product: { select: { id: true, codigo: true, nombre: true } } },
      });
    });
  }

  /** Elimina un registro; lo autoriza un supervisor con su PIN. */
  async deleteItem(ctx: AuthContext, itemId: string, pin: string) {
    const item = await this.prisma.postaReceiptItem.findFirst({
      where: { id: itemId, plantId: ctx.plantId },
      select: { id: true, receiptOrder: { select: { status: true } } },
    });
    if (!item) throw new NotFoundException('Registro no encontrado.');
    if (item.receiptOrder.status !== DispatchOrderStatus.activo) {
      throw new BadRequestException('La orden de recibo está cerrada: no se pueden eliminar registros.');
    }
    await verificarPinSupervisor(this.prisma, ctx.plantId, pin);
    await this.prisma.postaReceiptItem.delete({ where: { id: itemId } });
    return { ok: true };
  }

  /** Cliente y bodegas a las que puede entrar lo recibido (o por qué aún no se puede cerrar). */
  async destino(ctx: AuthContext, id: string) {
    const order = await this.findOne(ctx, id);
    return destinoRecibo(this.prisma, order.clienteId);
  }

  /** Cierra la orden con el PIN de un supervisor: el producto entra a la bodega del cliente. */
  async cerrar(ctx: AuthContext, id: string, pin: string, bodegaId?: string) {
    const order = await this.findOne(ctx, id);
    if (order.status !== DispatchOrderStatus.activo) {
      throw new BadRequestException('La orden de recibo ya está cerrada.');
    }
    const registros = await this.prisma.postaReceiptItem.count({ where: { receiptOrderId: id } });
    if (!registros) throw new BadRequestException('La orden no tiene producto recibido; no hay nada que cerrar.');
    const bodega = await bodegaParaCerrar(this.prisma, order.clienteId, bodegaId);
    const supervisorId = await verificarPinSupervisor(this.prisma, ctx.plantId, pin);
    await this.prisma.postaReceiptOrder.update({
      where: { id },
      data: { status: DispatchOrderStatus.facturado, cerradaAt: new Date(), cerradaById: supervisorId, bodegaId: bodega },
    });
    return { ok: true };
  }

  /** Deja constancia de la reimpresión del rótulo de un registro. */
  async registrarReimpresion(ctx: AuthContext, itemId: string, estacion?: string) {
    const item = await this.prisma.postaReceiptItem.findFirst({
      where: { id: itemId, plantId: ctx.plantId },
      select: { id: true, receiptOrderId: true },
    });
    if (!item) throw new NotFoundException('Registro no encontrado.');
    await this.prisma.postaReceiptReimpresion.create({
      data: {
        plantId: ctx.plantId,
        receiptOrderId: item.receiptOrderId,
        itemId: item.id,
        estacion: estacion ?? null,
        userId: ctx.userId,
      },
    });
    return { ok: true };
  }
}
