import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DispatchOrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthContext } from '../../common/auth/auth-context';
import { CreateProductionOrderDto, QueryProductionOrderDto } from './production-order.dto';

const include = {
  cliente: { select: { id: true, nit: true, concepto: true } },
  dispatchOrder: { select: { id: true, odNumber: true } },
} as const;

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
