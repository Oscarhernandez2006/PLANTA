import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DispatchOrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthContext } from '../../common/auth/auth-context';
import { parseCanalBarcode } from '../../common/canal-barcode';
import { barcodeDe, itemInclude, itemRow } from '../dispatch-order/dispatch-order.service';
import { CreateCanalDispatchOrderDto, QueryCanalDispatchOrderDto } from './canal-dispatch-order.dto';

const include = {
  cliente: { select: { id: true, nit: true, concepto: true } },
} as const;

@Injectable()
export class CanalDispatchOrderService {
  constructor(private readonly prisma: PrismaService) {}

  /** Próximo número de D.C. (solo previsualización; el definitivo se asigna al guardar). */
  async nextNumber(ctx: AuthContext) {
    const agg = await this.prisma.canalDispatchOrder.aggregate({
      _max: { dcNumber: true },
      where: { plantId: ctx.plantId },
    });
    return { next: (agg._max.dcNumber ?? 0) + 1 };
  }

  async create(ctx: AuthContext, dto: CreateCanalDispatchOrderDto) {
    const cliente = await this.prisma.cliente.findFirst({
      where: { id: dto.clienteId, active: true },
      select: { id: true },
    });
    if (!cliente) throw new BadRequestException('El cliente no existe o está inactivo.');

    return this.prisma.$transaction(async (tx) => {
      // Serializa la numeración por planta (caliente y frío comparten consecutivo).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${ctx.plantId}:dc`}))`;
      const agg = await tx.canalDispatchOrder.aggregate({
        _max: { dcNumber: true },
        where: { plantId: ctx.plantId },
      });
      return tx.canalDispatchOrder.create({
        data: {
          plantId: ctx.plantId,
          dcNumber: (agg._max.dcNumber ?? 0) + 1,
          tipo: dto.tipo,
          registrationDate: new Date(dto.registrationDate),
          processDate: new Date(dto.processDate),
          clienteId: dto.clienteId,
          status: dto.status ?? DispatchOrderStatus.activo,
          createdById: ctx.userId,
        },
        include,
      });
    });
  }

  async findAll(ctx: AuthContext, query: QueryCanalDispatchOrderDto) {
    const where: Prisma.CanalDispatchOrderWhereInput = {
      plantId: ctx.plantId,
      deletedAt: null,
      ...(query.tipo ? { tipo: query.tipo } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [total, data] = await this.prisma.$transaction([
      this.prisma.canalDispatchOrder.count({ where }),
      this.prisma.canalDispatchOrder.findMany({
        where,
        orderBy: { dcNumber: 'desc' },
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

  // ---- Canales despachadas: salen de su cava y del inventario ----

  private async orden(ctx: AuthContext, id: string) {
    const dc = await this.prisma.canalDispatchOrder.findFirst({
      where: { id, plantId: ctx.plantId, deletedAt: null },
      select: { id: true, status: true, tipo: true },
    });
    if (!dc) throw new NotFoundException('Orden de despacho de canales no encontrada.');
    return dc;
  }

  async items(ctx: AuthContext, id: string) {
    await this.orden(ctx, id);
    const items = await this.prisma.canalDispatchOrderItem.findMany({
      where: { canalDispatchOrderId: id },
      include: itemInclude,
      orderBy: { createdAt: 'asc' },
    });
    return items.map((i) => itemRow(i, barcodeDe(i)));
  }

  /** Agrega la canal del presinto: no puede estar en una OD a proceso (va a desposte/rotulado). */
  async addItem(ctx: AuthContext, id: string, barcode: string) {
    const dc = await this.orden(ctx, id);
    if (dc.status !== DispatchOrderStatus.activo) {
      throw new BadRequestException('La orden de despacho no está activa.');
    }
    if (dc.tipo === 'posta') {
      throw new BadRequestException('Las canales no se despachan en Despacho Posta.');
    }
    const codigo = parseCanalBarcode(barcode);
    if (!codigo) throw new BadRequestException('Código de barras no válido.');
    const etiqueta = barcode.trim().toUpperCase();

    try {
      const item = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`despacho-canal:${ctx.plantId}`}))`;
        const pieza = await tx.canalPieza.findFirst({
          where: {
            pieza: codigo.pieza,
            turno: codigo.turno,
            evento: {
              ordenBeneficio: { plantId: ctx.plantId, deletedAt: null, reference: codigo.lote },
            },
          },
          orderBy: { weighedAt: 'desc' },
          select: {
            id: true,
            cava: true,
            pesoKg: true,
            despacho: {
              select: {
                dispatchOrder: {
                  select: {
                    odNumber: true,
                    productionOrders: { where: { deletedAt: null }, select: { opNumber: true } },
                  },
                },
              },
            },
            despachoCanal: { select: { canalDispatchOrder: { select: { dcNumber: true } } } },
          },
        });
        if (!pieza) throw new NotFoundException(`No se encontró la canal ${etiqueta}.`);
        if (pieza.despacho) {
          const od = pieza.despacho.dispatchOrder;
          const ops = od.productionOrders.map((o) => formatOP(o.opNumber)).join(', ');
          throw new ConflictException(
            `La canal ${etiqueta} está en la orden de despacho a proceso ${formatOD(od.odNumber)}${
              ops ? ` (rotulado ${ops})` : ''
            }; va a desposte y no se puede despachar.`,
          );
        }
        if (pieza.despachoCanal) {
          throw new ConflictException(
            `La canal ${etiqueta} ya fue despachada en la orden ${formatDC(pieza.despachoCanal.canalDispatchOrder.dcNumber)}.`,
          );
        }
        if (!pieza.cava) {
          throw new BadRequestException(`La canal ${etiqueta} no está en ninguna cava (no está en inventario).`);
        }
        const creado = await tx.canalDispatchOrderItem.create({
          data: {
            canalDispatchOrderId: dc.id,
            canalPiezaId: pieza.id,
            cavaOrigen: pieza.cava,
            pesoCalienteKg: pieza.pesoKg,
            createdById: ctx.userId,
          },
          include: itemInclude,
        });
        await tx.canalPieza.update({ where: { id: pieza.id }, data: { cava: null } });
        return creado;
      });
      return itemRow(item, etiqueta);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`La canal ${etiqueta} ya fue despachada.`);
      }
      throw e;
    }
  }

  /** Peso de despacho de la canal; la diferencia es caliente - despacho. */
  async pesarItem(ctx: AuthContext, itemId: string, despachoKg: number) {
    const item = await this.itemActivo(ctx, itemId);
    const actualizado = await this.prisma.canalDispatchOrderItem.update({
      where: { id: item.id },
      data: { despachoKg: new Prisma.Decimal(despachoKg) },
      include: itemInclude,
    });
    return itemRow(actualizado, barcodeDe(actualizado));
  }

  /**
   * Cierra la orden: sus canales quedan despachadas y salen del inventario. Los registros
   * no se borran (consulta y posibles devoluciones).
   */
  async cerrar(ctx: AuthContext, id: string) {
    const dc = await this.orden(ctx, id);
    if (dc.status !== DispatchOrderStatus.activo) {
      throw new BadRequestException('La orden de despacho no está activa.');
    }
    const [canales, productos] = await Promise.all([
      this.prisma.canalDispatchOrderItem.count({ where: { canalDispatchOrderId: dc.id } }),
      this.prisma.dispatchProductItem.count({ where: { canalDispatchOrderId: dc.id } }),
    ]);
    if (!canales && !productos) throw new BadRequestException('La orden no tiene nada registrado.');
    await this.prisma.canalDispatchOrder.update({
      where: { id: dc.id },
      data: { status: DispatchOrderStatus.facturado },
    });
    return { ok: true };
  }

  /** Deshace el despacho por error: la canal vuelve a su cava de origen. */
  async removeItem(ctx: AuthContext, itemId: string) {
    const item = await this.itemActivo(ctx, itemId);
    await this.prisma.$transaction([
      this.prisma.canalDispatchOrderItem.delete({ where: { id: item.id } }),
      this.prisma.canalPieza.update({
        where: { id: item.canalPiezaId },
        data: { cava: item.cavaOrigen },
      }),
    ]);
    return { ok: true };
  }

  private async itemActivo(ctx: AuthContext, itemId: string) {
    const item = await this.prisma.canalDispatchOrderItem.findFirst({
      where: { id: itemId, canalDispatchOrder: { plantId: ctx.plantId, deletedAt: null } },
      select: {
        id: true,
        canalPiezaId: true,
        cavaOrigen: true,
        canalDispatchOrder: { select: { status: true } },
      },
    });
    if (!item) throw new NotFoundException('Registro no encontrado.');
    if (item.canalDispatchOrder.status !== DispatchOrderStatus.activo) {
      throw new BadRequestException('La orden de despacho no está activa.');
    }
    return item;
  }
}

const numero = (prefijo: string) => (n: number) => `${prefijo}${String(n).padStart(7, '0')}`;
const formatOD = numero('OD');
const formatOP = numero('OP');
const formatDC = numero('DC');
