import { Injectable, NotFoundException } from '@nestjs/common';
import { DispatchOrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthContext } from '../../common/auth/auth-context';
import { CreatePostaReceiptDto } from './dto/create-posta-receipt.dto';
import { CreatePostaReceiptItemDto } from './dto/create-posta-receipt-item.dto';
import { QueryPostaReceiptDto } from './dto/query-posta-receipt.dto';

const clientSelect = {
  select: { id: true, nit: true, name: true, sede: true },
} as const;

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
          clientId: dto.clientId,
          status: dto.status ?? DispatchOrderStatus.activo,
          createdById: ctx.userId,
        },
        include: { client: clientSelect },
      });
    });
  }

  async findAll(ctx: AuthContext, query: QueryPostaReceiptDto) {
    const where: Prisma.PostaReceiptOrderWhereInput = {
      plantId: ctx.plantId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
    };

    const [total, data] = await this.prisma.$transaction([
      this.prisma.postaReceiptOrder.count({ where }),
      this.prisma.postaReceiptOrder.findMany({
        where,
        orderBy: { receiptNumber: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { client: clientSelect },
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
    const order = await this.prisma.postaReceiptOrder.findFirst({
      where: { id, plantId: ctx.plantId, deletedAt: null },
      include: { client: clientSelect },
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
    await this.findOne(ctx, orderId);
    const netoKg = dto.brutoKg - dto.taraKg;
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
          createdById: ctx.userId,
        },
        include: { product: { select: { id: true, codigo: true, nombre: true } } },
      });
    });
  }

  async deleteItem(ctx: AuthContext, itemId: string) {
    const item = await this.prisma.postaReceiptItem.findFirst({
      where: { id: itemId, plantId: ctx.plantId },
    });
    if (!item) throw new NotFoundException('Registro no encontrado.');
    await this.prisma.postaReceiptItem.delete({ where: { id: itemId } });
    return { ok: true };
  }
}
