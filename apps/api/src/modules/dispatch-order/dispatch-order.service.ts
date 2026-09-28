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
import { CreateDispatchOrderDto } from './dto/create-dispatch-order.dto';
import { QueryDispatchOrderDto } from './dto/query-dispatch-order.dto';

const clienteSelect = {
  select: { id: true, nit: true, concepto: true },
} as const;

const itemInclude = {
  canalPieza: {
    include: {
      evento: {
        include: {
          ordenBeneficio: { select: { reference: true, cliente: true, date: true } },
        },
      },
    },
  },
} as const;

type ItemConPieza = Prisma.DispatchOrderItemGetPayload<{ include: typeof itemInclude }>;

function itemRow(i: ItemConPieza, barcode: string) {
  const p = i.canalPieza;
  return {
    itemId: i.id,
    piezaId: p.id,
    barcode,
    reference: p.evento.ordenBeneficio.reference,
    cliente: p.evento.ordenBeneficio.cliente,
    date: p.evento.ordenBeneficio.date.toISOString().slice(0, 10),
    canalAnimalTipo: p.evento.canalAnimalTipo,
    canalTipo: p.evento.canalTipo,
    pieza: p.pieza,
    destino: p.destino,
    observaciones: p.observaciones,
    sequence: p.evento.sequence,
    turno: p.turno,
    cavaOrigen: i.cavaOrigen,
    pesoKg: Number(i.pesoCalienteKg),
    despachoKg: i.despachoKg === null ? null : Number(i.despachoKg),
    despachadoAt: i.createdAt.toISOString(),
  };
}

/** Código de barras del presinto a partir de los datos de la pieza (mismo formato que Canal Caliente). */
function barcodeDe(i: ItemConPieza) {
  const p = i.canalPieza;
  const tipo = p.evento.canalTipo;
  const digito = tipo === 'canal_completa' ? 1 : p.pieza === 'cizq' ? 2 : 3;
  const lado = p.pieza === 'cizq' ? 'I' : p.pieza === 'cder' ? 'D' : '';
  return `${p.evento.ordenBeneficio.reference}-${p.turno ?? p.evento.sequence}${digito}${lado}`;
}

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
    const cliente = await this.prisma.cliente.findFirst({
      where: { id: dto.clienteId, active: true },
      select: { id: true },
    });
    if (!cliente) throw new BadRequestException('El cliente no existe o está inactivo.');

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
          clienteId: dto.clienteId,
          status: dto.status ?? DispatchOrderStatus.activo,
          createdById: ctx.userId,
        },
        include: { cliente: clienteSelect },
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

  async findOne(ctx: AuthContext, id: string) {
    const order = await this.prisma.dispatchOrder.findFirst({
      where: { id, plantId: ctx.plantId, deletedAt: null },
      include: { cliente: clienteSelect },
    });
    if (!order) throw new NotFoundException('Orden de despacho no encontrada.');
    return order;
  }

  // ---- Piezas despachadas (salen de la cava y quedan en la orden) ----

  async items(ctx: AuthContext, orderId: string) {
    await this.findOne(ctx, orderId);
    const items = await this.prisma.dispatchOrderItem.findMany({
      where: { dispatchOrderId: orderId },
      include: itemInclude,
      orderBy: { createdAt: 'asc' },
    });
    return items.map((i) => itemRow(i, barcodeDe(i)));
  }

  /** Despacha la pieza del presinto: sale de su cava y queda asociada a la orden. */
  async addItem(ctx: AuthContext, orderId: string, barcode: string) {
    const order = await this.findOne(ctx, orderId);
    if (order.status !== DispatchOrderStatus.activo) {
      throw new BadRequestException('La orden de despacho no está activa.');
    }
    const codigo = parseCanalBarcode(barcode);
    if (!codigo) throw new BadRequestException('Código de barras no válido.');

    const pieza = await this.prisma.canalPieza.findFirst({
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
        despacho: { select: { dispatchOrder: { select: { odNumber: true } } } },
      },
    });
    const etiqueta = barcode.trim().toUpperCase();
    if (!pieza) throw new NotFoundException(`No se encontró la canal ${etiqueta}.`);
    if (pieza.despacho) {
      const od = `OD${String(pieza.despacho.dispatchOrder.odNumber).padStart(7, '0')}`;
      throw new ConflictException(`La canal ${etiqueta} ya fue despachada en la orden ${od}.`);
    }
    if (!pieza.cava) {
      throw new BadRequestException(`La canal ${etiqueta} no está en ninguna cava.`);
    }

    try {
      const item = await this.prisma.$transaction(async (tx) => {
        const creado = await tx.dispatchOrderItem.create({
          data: {
            dispatchOrderId: orderId,
            canalPiezaId: pieza.id,
            cavaOrigen: pieza.cava!,
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

  /** Registra el peso en frío (despacho) de una pieza; la merma es caliente - despacho. */
  async pesarItem(ctx: AuthContext, itemId: string, despachoKg: number) {
    const item = await this.prisma.dispatchOrderItem.findFirst({
      where: { id: itemId, dispatchOrder: { plantId: ctx.plantId, deletedAt: null } },
      select: { id: true, dispatchOrder: { select: { status: true } } },
    });
    if (!item) throw new NotFoundException('Registro no encontrado.');
    if (item.dispatchOrder.status !== DispatchOrderStatus.activo) {
      throw new BadRequestException('La orden de despacho no está activa.');
    }
    const actualizado = await this.prisma.dispatchOrderItem.update({
      where: { id: item.id },
      data: { despachoKg: new Prisma.Decimal(despachoKg) },
      include: itemInclude,
    });
    return itemRow(actualizado, barcodeDe(actualizado));
  }

  /** Deshace un despacho por error: la pieza vuelve a su cava de origen. */
  async removeItem(ctx: AuthContext, itemId: string) {
    const item = await this.prisma.dispatchOrderItem.findFirst({
      where: { id: itemId, dispatchOrder: { plantId: ctx.plantId, deletedAt: null } },
      select: {
        id: true,
        canalPiezaId: true,
        cavaOrigen: true,
        dispatchOrder: { select: { status: true } },
      },
    });
    if (!item) throw new NotFoundException('Registro no encontrado.');
    if (item.dispatchOrder.status !== DispatchOrderStatus.activo) {
      throw new BadRequestException('La orden de despacho no está activa.');
    }
    await this.prisma.$transaction([
      this.prisma.dispatchOrderItem.delete({ where: { id: item.id } }),
      this.prisma.canalPieza.update({
        where: { id: item.canalPiezaId },
        data: { cava: item.cavaOrigen },
      }),
    ]);
    return { ok: true };
  }
}
