import { Injectable, NotFoundException } from '@nestjs/common';
import { DispatchOrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthContext } from '../../common/auth/auth-context';
import { CreateCanalReceiptDto } from './dto/create-canal-receipt.dto';
import { CreateCanalReceiptItemDto } from './dto/create-canal-receipt-item.dto';
import { QueryCanalReceiptDto } from './dto/query-canal-receipt.dto';

const clientSelect = {
  select: { id: true, nit: true, name: true, sede: true },
} as const;

@Injectable()
export class CanalReceiptService {
  constructor(private readonly prisma: PrismaService) {}

  /** Próximo número de recibo (solo previsualización; el definitivo se asigna al guardar). */
  async nextNumber(ctx: AuthContext) {
    const agg = await this.prisma.canalReceiptOrder.aggregate({
      _max: { receiptNumber: true },
      where: { plantId: ctx.plantId },
    });
    return { next: (agg._max.receiptNumber ?? 0) + 1 };
  }

  async create(ctx: AuthContext, dto: CreateCanalReceiptDto) {
    return this.prisma.$transaction(async (tx) => {
      // Serializa la numeración por planta.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${ctx.plantId}:canal-receipt`}))`;
      const agg = await tx.canalReceiptOrder.aggregate({
        _max: { receiptNumber: true },
        where: { plantId: ctx.plantId },
      });
      const receiptNumber = (agg._max.receiptNumber ?? 0) + 1;

      return tx.canalReceiptOrder.create({
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

  async findAll(ctx: AuthContext, query: QueryCanalReceiptDto) {
    const where: Prisma.CanalReceiptOrderWhereInput = {
      plantId: ctx.plantId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
    };

    const [total, data] = await this.prisma.$transaction([
      this.prisma.canalReceiptOrder.count({ where }),
      this.prisma.canalReceiptOrder.findMany({
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
    const order = await this.prisma.canalReceiptOrder.findFirst({
      where: { id, plantId: ctx.plantId, deletedAt: null },
      include: { client: clientSelect },
    });
    if (!order) throw new NotFoundException('Recibo de canal no encontrado.');
    return order;
  }

  // ---- Canales pesados (items) de una orden de recibo ----

  async items(ctx: AuthContext, orderId: string) {
    await this.findOne(ctx, orderId);
    return this.prisma.canalReceiptItem.findMany({
      where: { receiptOrderId: orderId },
      orderBy: { codigo: 'asc' },
    });
  }

  async addItem(
    ctx: AuthContext,
    orderId: string,
    dto: CreateCanalReceiptItemDto,
  ) {
    await this.findOne(ctx, orderId);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${orderId}:canal-item`}))`;
      const agg = await tx.canalReceiptItem.aggregate({
        _max: { codigo: true },
        where: { receiptOrderId: orderId },
      });
      const codigo = (agg._max.codigo ?? 0) + 1;
      return tx.canalReceiptItem.create({
        data: {
          receiptOrderId: orderId,
          plantId: ctx.plantId,
          codigo,
          cava: dto.cava,
          pesoKg: new Prisma.Decimal(dto.pesoKg),
          guia: dto.guia?.trim() || null,
          lote: dto.lote?.trim() || null,
          identificacion: dto.identificacion?.trim() || null,
          createdById: ctx.userId,
        },
      });
    });
  }

  async deleteItem(ctx: AuthContext, itemId: string) {
    const item = await this.prisma.canalReceiptItem.findFirst({
      where: { id: itemId, plantId: ctx.plantId },
    });
    if (!item) throw new NotFoundException('Registro no encontrado.');
    await this.prisma.canalReceiptItem.delete({ where: { id: itemId } });
    return { ok: true };
  }
}
