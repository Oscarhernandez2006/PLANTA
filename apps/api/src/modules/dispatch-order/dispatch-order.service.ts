import { Injectable, NotFoundException } from '@nestjs/common';
import { DispatchOrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthContext } from '../../common/auth/auth-context';
import { CreateDispatchOrderDto } from './dto/create-dispatch-order.dto';
import { QueryDispatchOrderDto } from './dto/query-dispatch-order.dto';

const clientSelect = {
  select: { id: true, nit: true, name: true, sede: true },
} as const;

@Injectable()
export class DispatchOrderService {
  constructor(private readonly prisma: PrismaService) {}

  /** Próximo número de O.D. (solo previsualización; el definitivo se asigna al guardar). */
  async nextNumber(ctx: AuthContext) {
    const agg = await this.prisma.dispatchOrder.aggregate({
      _max: { odNumber: true },
      where: { plantId: ctx.plantId },
    });
    return { next: (agg._max.odNumber ?? 0) + 1 };
  }

  async create(ctx: AuthContext, dto: CreateDispatchOrderDto) {
    return this.prisma.$transaction(async (tx) => {
      // Serializa la numeración por planta.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${ctx.plantId}:od`}))`;
      const agg = await tx.dispatchOrder.aggregate({
        _max: { odNumber: true },
        where: { plantId: ctx.plantId },
      });
      const odNumber = (agg._max.odNumber ?? 0) + 1;

      return tx.dispatchOrder.create({
        data: {
          plantId: ctx.plantId,
          odNumber,
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

  async findAll(ctx: AuthContext, query: QueryDispatchOrderDto) {
    const where: Prisma.DispatchOrderWhereInput = {
      plantId: ctx.plantId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
    };

    const [total, data] = await this.prisma.$transaction([
      this.prisma.dispatchOrder.count({ where }),
      this.prisma.dispatchOrder.findMany({
        where,
        orderBy: { odNumber: 'desc' },
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
    const order = await this.prisma.dispatchOrder.findFirst({
      where: { id, plantId: ctx.plantId, deletedAt: null },
      include: { client: clientSelect },
    });
    if (!order) throw new NotFoundException('Orden de despacho no encontrada.');
    return order;
  }
}
