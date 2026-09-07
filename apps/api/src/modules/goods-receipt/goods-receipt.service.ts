import { Injectable, NotFoundException } from '@nestjs/common';
import {
  GoodsReceiptStatus,
  Prisma,
  Species,
  TraceEventType,
  TraceUnitStatus,
  TraceUnitType,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthContext } from '../../common/auth/auth-context';
import { CreateGoodsReceiptDto } from './dto/create-goods-receipt.dto';
import { QueryGoodsReceiptDto } from './dto/query-goods-receipt.dto';
import { buildReceiptNumber, normalizeQuarterType } from './goods-receipt.numbering';

@Injectable()
export class GoodsReceiptService {
  constructor(private readonly prisma: PrismaService) {}

  async create(ctx: AuthContext, dto: CreateGoodsReceiptDto) {
    const year = new Date(dto.receivedDate).getUTCFullYear();

    return this.prisma.$transaction(async (tx) => {
      // Auditoría: expone el usuario actual a los triggers fn_audit (SET LOCAL).
      await tx.$executeRaw`SELECT set_config('app.current_user_id', ${ctx.userId}, true)`;

      // Serializa la numeración consecutiva por planta y año (evita colisiones).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${ctx.plantId}:${year}`}))`;

      const prefix = `ING-${year}-`;
      const count = await tx.goodsReceipt.count({
        where: { plantId: ctx.plantId, receiptNumber: { startsWith: prefix } },
      });
      const receiptNumber = buildReceiptNumber(year, count + 1);

      const receipt = await tx.goodsReceipt.create({
        data: {
          plantId: ctx.plantId,
          receiptNumber,
          supplierId: dto.supplierId,
          originIcaCode: dto.originIcaCode ?? null,
          receivedDate: new Date(dto.receivedDate),
          status: GoodsReceiptStatus.confirmado,
          receivedById: ctx.userId,
          extra: (dto.extra ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          items: {
            create: dto.items.map((it) => ({
              plantId: ctx.plantId,
              itemCode: it.itemCode,
              unitForm: it.unitForm,
              quarterType: normalizeQuarterType(it.unitForm, it.quarterType),
              weightKg: it.weightKg,
              species: Species.bovino,
            })),
          },
        },
        include: { items: true, supplier: true },
      });

      // Trazabilidad: un evento de ingreso + una unidad raíz (DAG) por cada ítem.
      await tx.traceEvent.create({
        data: {
          plantId: ctx.plantId,
          eventType: TraceEventType.ingreso,
          actorId: ctx.userId,
          payload: {
            goodsReceiptId: receipt.id,
            receiptNumber,
            itemCount: receipt.items.length,
          },
        },
      });

      await tx.traceUnit.createMany({
        data: receipt.items.map((it) => ({
          plantId: ctx.plantId,
          unitType: TraceUnitType.receipt_item,
          entityId: it.id,
          publicCode: it.itemCode,
          status: TraceUnitStatus.activa,
        })),
      });

      return receipt;
    });
  }

  async findAll(ctx: AuthContext, query: QueryGoodsReceiptDto) {
    const where: Prisma.GoodsReceiptWhereInput = {
      plantId: ctx.plantId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
    };

    const [total, data] = await this.prisma.$transaction([
      this.prisma.goodsReceipt.count({ where }),
      this.prisma.goodsReceipt.findMany({
        where,
        orderBy: { receivedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          supplier: { select: { id: true, name: true } },
          _count: { select: { items: true } },
        },
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
    const receipt = await this.prisma.goodsReceipt.findFirst({
      where: { id, plantId: ctx.plantId, deletedAt: null },
      include: { items: true, supplier: true },
    });

    if (!receipt) {
      throw new NotFoundException(`Ingreso ${id} no encontrado.`);
    }

    return receipt;
  }
}
