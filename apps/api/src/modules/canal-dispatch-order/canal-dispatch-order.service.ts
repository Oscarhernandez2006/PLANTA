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
import {
  canalRecibidaDisponible,
  canalRecibidaRow,
  canalRecibidaSelect,
  parseReciboCanal,
} from '../canal-receipt/recibo-despacho';
import { CerrarCanalDispatchOrderDto, CreateCanalDispatchOrderDto, QueryCanalDispatchOrderDto } from './canal-dispatch-order.dto';
import { crearGuia } from '../guia-transporte/guia-transporte.service';
import { exigirSinArrumeAbierto } from '../picking/arrume';
import { exigirPreordenesCompletas } from '../picking/preordenes-completas';
import { nombrePreorden } from '../picking/avance-preorden';

const include = {
  cliente: { select: { id: true, nit: true, concepto: true } },
} as const;

/** Una guía de movilidad va con un solo despacho: para el mismo camión se crea otra guía. */
const guiaUsada = (numero: number) =>
  `La guía GM${numero} ya salió con otra orden de despacho y no se puede volver a usar. Crea una guía nueva (puedes copiar sus datos).`;

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
      select: { id: true, status: true, tipo: true, clienteId: true },
    });
    if (!dc) throw new NotFoundException('Orden de despacho de canales no encontrada.');
    return dc;
  }

  async items(ctx: AuthContext, id: string) {
    await this.orden(ctx, id);
    const [items, recibidas] = await Promise.all([
      this.prisma.canalDispatchOrderItem.findMany({
        where: { canalDispatchOrderId: id },
        include: itemInclude,
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.canalReceiptItem.findMany({
        where: { canalDispatchOrderId: id },
        select: canalRecibidaSelect,
        orderBy: { despachadoAt: 'asc' },
      }),
    ]);
    return [...items.map((i) => itemRow(i, barcodeDe(i))), ...recibidas.map(canalRecibidaRow)];
  }

  /** Canal recibida activa en una DC de esta planta (para pesar o quitar). */
  private async recibidaEnOrden(ctx: AuthContext, itemId: string) {
    const r = await this.prisma.canalReceiptItem.findFirst({
      where: { id: itemId, plantId: ctx.plantId, canalDispatchOrder: { deletedAt: null } },
      select: { id: true, canalDispatchOrder: { select: { status: true } } },
    });
    if (r && r.canalDispatchOrder?.status !== DispatchOrderStatus.activo) {
      throw new BadRequestException('La orden de despacho no está activa.');
    }
    return r;
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
    if (parseReciboCanal(barcode)) {
      return this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`despacho-canal:${ctx.plantId}`}))`;
        const itemId = await canalRecibidaDisponible(tx, ctx, barcode, dc.clienteId);
        await tx.canalReceiptItem.update({
          where: { id: itemId },
          data: { canalDispatchOrderId: dc.id, despachadoAt: new Date(), despachadoById: ctx.userId },
        });
        return canalRecibidaRow(
          await tx.canalReceiptItem.findUniqueOrThrow({ where: { id: itemId }, select: canalRecibidaSelect }),
        );
      });
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
    const recibida = await this.recibidaEnOrden(ctx, itemId);
    if (recibida) {
      return canalRecibidaRow(
        await this.prisma.canalReceiptItem.update({
          where: { id: recibida.id },
          data: { despachoKg: new Prisma.Decimal(despachoKg) },
          select: canalRecibidaSelect,
        }),
      );
    }
    const item = await this.itemActivo(ctx, itemId);
    const actualizado = await this.prisma.canalDispatchOrderItem.update({
      where: { id: item.id },
      data: { despachoKg: new Prisma.Decimal(despachoKg) },
      include: itemInclude,
    });
    return itemRow(actualizado, barcodeDe(actualizado));
  }

  /**
   * Despacho posta al cliente: tiendas (pre-órdenes) que llevan producto. Si alguna tiene
   * tienda, al cerrar sin punto de envío sale una remisión por tienda, cada una en su camión.
   */
  async tiendasRemision(ctx: AuthContext, id: string) {
    const dc = await this.orden(ctx, id);
    if (dc.tipo !== 'posta') return { porTienda: false, tiendas: [], sinTienda: 0 };
    const [preordenes, sinTienda] = await Promise.all([
      this.prisma.picking.findMany({
        where: { canalDispatchOrderId: dc.id },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          ocNumero: true,
          tiendaCodigo: true,
          tiendaNombre: true,
          despachoItems: { select: { netoKg: true } },
        },
      }),
      this.prisma.dispatchProductItem.count({ where: { canalDispatchOrderId: dc.id, pickingId: null } }),
    ]);
    const tiendas = preordenes
      .filter((p) => p.despachoItems.length)
      .map((p) => ({
        pickingId: p.id,
        nombre: nombrePreorden(p),
        tiendaCodigo: p.tiendaCodigo,
        tiendaNombre: p.tiendaNombre,
        ocNumero: p.ocNumero,
        empaques: p.despachoItems.length,
        kg: Math.round(p.despachoItems.reduce((s, i) => s + Number(i.netoKg), 0) * 100) / 100,
      }));
    return { porTienda: tiendas.some((t) => t.tiendaCodigo || t.tiendaNombre), tiendas, sinTienda };
  }

  /**
   * Cierra la orden: sus canales quedan despachadas y salen del inventario. Los registros
   * no se borran (consulta y posibles devoluciones).
   */
  async cerrar(ctx: AuthContext, id: string, dto: CerrarCanalDispatchOrderDto) {
    const dc = await this.orden(ctx, id);
    if (dc.status !== DispatchOrderStatus.activo) {
      throw new BadRequestException('La orden de despacho no está activa.');
    }
    const remisionTiendas = dto.puntoEnvioId ? null : await this.tiendasRemision(ctx, id);
    const porTienda = !!remisionTiendas?.porTienda;
    if (!porTienda && !!dto.guiaTransporteId === !!dto.nuevaGuia) {
      throw new BadRequestException('Elige la guía de transporte de la orden o crea una nueva.');
    }
    const [canales, productos, recibidas] = await Promise.all([
      this.prisma.canalDispatchOrderItem.count({ where: { canalDispatchOrderId: dc.id } }),
      this.prisma.dispatchProductItem.count({ where: { canalDispatchOrderId: dc.id } }),
      this.prisma.canalReceiptItem.count({ where: { canalDispatchOrderId: dc.id } }),
    ]);
    if (!canales && !productos && !recibidas) throw new BadRequestException('La orden no tiene nada registrado.');
    await exigirSinArrumeAbierto(this.prisma, { canalDispatchOrderId: dc.id });
    await exigirPreordenesCompletas(this.prisma, ctx.plantId, { canalDispatchOrderId: dc.id }, dto.pin);
    if (dto.puntoEnvioId) {
      const punto = await this.prisma.puntoEnvio.findFirst({
        where: { id: dto.puntoEnvioId, clienteId: dc.clienteId, active: true },
        select: { id: true },
      });
      if (!punto) throw new BadRequestException('El punto de envío no es de este cliente o está inactivo.');
    }
    if (dto.guiaTransporteId && !porTienda) {
      const guia = await this.prisma.guiaTransporte.findFirst({
        where: { id: dto.guiaTransporteId, plantId: ctx.plantId, deletedAt: null },
        select: { id: true, numero: true, _count: { select: { despachos: true, remisiones: true } } },
      });
      if (!guia) throw new BadRequestException('La guía de transporte no existe.');
      if (guia._count.despachos || guia._count.remisiones) throw new BadRequestException(guiaUsada(guia.numero));
    }
    const camiones = porTienda ? await this.validarCamiones(ctx, remisionTiendas!, dto) : null;
    return this.prisma.$transaction(async (tx) => {
      if (camiones) {
        const guiaIds: string[] = [];
        for (const g of camiones.guias) guiaIds.push(g.nuevaGuia ? (await crearGuia(tx, ctx, g.nuevaGuia)).id : g.guiaTransporteId!);
        const { count } = await tx.canalDispatchOrder.updateMany({
          where: { id: dc.id, status: DispatchOrderStatus.activo },
          data: { status: DispatchOrderStatus.facturado, puntoEnvioId: null, guiaTransporteId: null, cerradaAt: new Date() },
        });
        if (!count) throw new BadRequestException('La orden de despacho ya fue cerrada.');
        for (const [k, t] of remisionTiendas!.tiendas.entries()) {
          await tx.picking.update({
            where: { id: t.pickingId },
            data: { guiaTransporteId: guiaIds[camiones.asignacion.get(t.pickingId)!], remisionNumero: k + 1 },
          });
        }
        return { ok: true, guiaTransporteId: guiaIds[0], guiaTransporteIds: guiaIds, remisiones: remisionTiendas!.tiendas.length };
      }
      const guiaId = dto.nuevaGuia ? (await crearGuia(tx, ctx, dto.nuevaGuia)).id : dto.guiaTransporteId!;
      // Solo cierra si sigue activa (evita doble cierre simultáneo).
      const { count } = await tx.canalDispatchOrder.updateMany({
        where: { id: dc.id, status: DispatchOrderStatus.activo },
        data: {
          status: DispatchOrderStatus.facturado,
          puntoEnvioId: dto.puntoEnvioId ?? null,
          guiaTransporteId: guiaId,
          cerradaAt: new Date(),
        },
      });
      if (!count) throw new BadRequestException('La orden de despacho ya fue cerrada.');
      return { ok: true, guiaTransporteId: guiaId, guiaTransporteIds: [guiaId], remisiones: 1 };
    });
  }

  /** Cada tienda va en uno de los camiones, y cada camión es una guía existente o una nueva. */
  private async validarCamiones(
    ctx: AuthContext,
    remision: Awaited<ReturnType<CanalDispatchOrderService['tiendasRemision']>>,
    dto: CerrarCanalDispatchOrderDto,
  ) {
    if (remision.sinTienda) {
      throw new BadRequestException(
        `${remision.sinTienda} producto(s) de la orden no tienen tienda: quítalos y pistoléalos de nuevo eligiendo la tienda.`,
      );
    }
    const guias = dto.guias ?? [];
    if (!guias.length) throw new BadRequestException('Agrega el camión (guía de transporte) de cada tienda.');
    for (const [k, g] of guias.entries()) {
      if (!!g.guiaTransporteId === !!g.nuevaGuia) {
        throw new BadRequestException(`Camión ${k + 1}: elige una guía existente o crea una nueva.`);
      }
    }
    const existentes = guias.flatMap((g) => (g.guiaTransporteId ? [g.guiaTransporteId] : []));
    if (new Set(existentes).size !== existentes.length) {
      throw new BadRequestException('La misma guía de transporte está en dos camiones.');
    }
    if (existentes.length) {
      const encontradas = await this.prisma.guiaTransporte.findMany({
        where: { id: { in: existentes }, plantId: ctx.plantId, deletedAt: null },
        select: { numero: true, _count: { select: { despachos: true, remisiones: true } } },
      });
      if (encontradas.length !== existentes.length) throw new BadRequestException('Una de las guías de transporte no existe.');
      const usada = encontradas.find((g) => g._count.despachos || g._count.remisiones);
      if (usada) throw new BadRequestException(guiaUsada(usada.numero));
    }
    const asignacion = new Map<string, number>();
    for (const r of dto.remisiones ?? []) {
      if (r.guia >= guias.length) throw new BadRequestException('Una tienda tiene un camión que no existe.');
      asignacion.set(r.pickingId, r.guia);
    }
    const faltan = remision.tiendas.filter((t) => !asignacion.has(t.pickingId));
    if (faltan.length) {
      throw new BadRequestException(`Asigna el camión de: ${faltan.map((t) => t.nombre).join(', ')}.`);
    }
    const usados = new Set(remision.tiendas.map((t) => asignacion.get(t.pickingId)));
    const vacio = guias.findIndex((_, k) => !usados.has(k));
    if (vacio >= 0) throw new BadRequestException(`El camión ${vacio + 1} no lleva ninguna tienda: asígnale tiendas o quítalo.`);
    return { guias, asignacion };
  }

  /** Deshace el despacho por error: la canal vuelve a su cava de origen. */
  async removeItem(ctx: AuthContext, itemId: string) {
    const recibida = await this.recibidaEnOrden(ctx, itemId);
    if (recibida) {
      await this.prisma.canalReceiptItem.update({
        where: { id: recibida.id },
        data: { canalDispatchOrderId: null, despachoKg: null, despachadoAt: null, despachadoById: null },
      });
      return { ok: true };
    }
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

const numero = (prefijo: string) => (n: number) => `${prefijo}${n}`;
const formatOD = numero('OD');
const formatOP = numero('OP');
const formatDC = numero('DC');
