import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DispatchOrderStatus, PickingStatus, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthContext } from '../../common/auth/auth-context';
import { DespachoPostaService } from '../canal-dispatch-order/despacho-posta.service';
import { TransferOrderService } from '../transfer-order/transfer-order.service';
import type { AgregarPickingDto, GuardarPreordenDto, ImportarOrdenesCompraDto, RegistrarArrumeDto } from './picking.dto';
import { avancePreorden, type LineaAvance } from './avance-preorden';
import { repartirArrume } from './repartir-arrume';

export const TIPOS_PICKING = ['posta', 'traslado'] as const;
export type TipoPicking = (typeof TIPOS_PICKING)[number];

type Db = Prisma.TransactionClient;
type Orden = { id: string; numero: string; status: DispatchOrderStatus; clienteId: string };

// Código de barras de 8 dígitos (pieza o canastilla de Rotulado), único válido en traslado.
const CODIGO_TRASLADO = /^[1-9]\d{7}$/;

const itemSelect = {
  id: true,
  codigo: true,
  tipo: true,
  productId: true,
  unds: true,
  netoEtiquetaKg: true,
  createdAt: true,
  product: { select: { codigo: true, nombre: true } },
} as const;

type ItemRow = Prisma.PickingItemGetPayload<{ select: typeof itemSelect }>;

const itemDto = (i: ItemRow, pesado: boolean) => ({
  id: i.id,
  codigo: i.codigo,
  tipo: i.tipo,
  productoCodigo: i.product.codigo,
  productoNombre: i.product.nombre,
  unds: i.unds,
  netoEtiquetaKg: Number(i.netoEtiquetaKg),
  createdAt: i.createdAt.toISOString(),
  pesado,
});

const lineaSelect = {
  productId: true,
  plu: true,
  productoCliente: true,
  kgPedidos: true,
  product: { select: { codigo: true, nombre: true } },
} as const;

const preordenSelect = {
  id: true,
  canalDispatchOrderId: true,
  transferOrderId: true,
  ocNumero: true,
  tiendaCodigo: true,
  tiendaNombre: true,
  observaciones: true,
  asignadoAt: true,
  asignadoA: { select: { id: true, fullName: true } },
  status: true,
  terminadoAt: true,
  createdAt: true,
  items: { orderBy: { createdAt: 'desc' }, select: itemSelect },
  lineas: { select: lineaSelect },
} as const satisfies Prisma.PickingSelect;

type PreordenRow = Prisma.PickingGetPayload<{ select: typeof preordenSelect }>;

// Picking de una orden activa (no anulada): sus etiquetas están reservadas.
const pickingActivo: Prisma.PickingWhereInput = {
  OR: [
    { canalDispatchOrder: { status: DispatchOrderStatus.activo, deletedAt: null } },
    { transferOrder: { status: DispatchOrderStatus.activo, deletedAt: null } },
  ],
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const fmtKg = (n: number) => n.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
const texto = (v: string | null | undefined) => v?.trim() || null;

export const nombrePreorden = (p: { ocNumero: string | null; tiendaNombre: string | null }) =>
  [p.tiendaNombre, p.ocNumero ? `OC ${p.ocNumero}` : null].filter(Boolean).join(' · ') || 'Sin orden de compra';

export type AvisoPedido = { tipo: 'fuera' | 'excedido' | 'completo'; mensaje: string };

// Pueden liberar una pre-orden asignada a otro alistador (para destrabarla).
const ROLES_LIBERAN: UserRole[] = [UserRole.desarrollador, UserRole.admin, UserRole.supervisor];

/** Solo el alistador asignado puede alistar, quitar, terminar o reabrir la pre-orden. */
function exigirAsignada(ctx: AuthContext, p: { asignadoAId: string | null; asignadoA: { fullName: string } | null }) {
  if (!p.asignadoAId) throw new BadRequestException('Asígnate la pre-orden antes de alistarla.');
  if (p.asignadoAId !== ctx.userId) {
    throw new ForbiddenException(`La pre-orden está asignada a ${p.asignadoA?.fullName ?? 'otro alistador'}.`);
  }
}
/**
 * Picking (pre-órdenes): el alistador pistolea en la terminal las etiquetas que salen de la
 * cava para una orden de despacho posta o de traslado. Una orden puede tener varias
 * pre-órdenes (una por tienda / orden de compra del cliente, con sus kilos pedidos). No mueve
 * inventario; las etiquetas se registran en la orden cuando se pesa el arrume en escritorio.
 */
@Injectable()
export class PickingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posta: DespachoPostaService,
    private readonly traslado: TransferOrderService,
  ) {}

  private tipo(tipo: string): TipoPicking {
    if (!(TIPOS_PICKING as readonly string[]).includes(tipo)) {
      throw new BadRequestException('Tipo de picking no válido.');
    }
    return tipo as TipoPicking;
  }

  private async orden(ctx: AuthContext, tipo: TipoPicking, id: string): Promise<Orden> {
    if (tipo === 'posta') {
      const dc = await this.prisma.canalDispatchOrder.findFirst({
        where: { id, plantId: ctx.plantId, deletedAt: null, tipo: 'posta' },
        select: { id: true, dcNumber: true, status: true, clienteId: true },
      });
      if (!dc) throw new NotFoundException('Orden de despacho posta no encontrada.');
      return { id: dc.id, numero: `DC${dc.dcNumber}`, status: dc.status, clienteId: dc.clienteId };
    }
    const ot = await this.prisma.transferOrder.findFirst({
      where: { id, plantId: ctx.plantId, deletedAt: null },
      select: { id: true, otNumber: true, status: true, clienteId: true },
    });
    if (!ot) throw new NotFoundException('Orden de traslado no encontrada.');
    return { id: ot.id, numero: `OT${ot.otNumber}`, status: ot.status, clienteId: ot.clienteId };
  }

  private async ordenActiva(ctx: AuthContext, tipo: TipoPicking, id: string) {
    const o = await this.orden(ctx, tipo, id);
    if (o.status !== DispatchOrderStatus.activo) {
      throw new BadRequestException(`La orden ${o.numero} no está activa.`);
    }
    return o;
  }

  private whereOrden(tipo: TipoPicking, ordenId: string): Prisma.PickingWhereInput {
    return tipo === 'posta' ? { canalDispatchOrderId: ordenId } : { transferOrderId: ordenId };
  }

  /** Pre-orden de la planta con su orden (tipo, id) para validar estado. */
  private async preorden(ctx: AuthContext, id: string) {
    const p = await this.prisma.picking.findFirst({
      where: { id, plantId: ctx.plantId },
      select: {
        id: true,
        status: true,
        canalDispatchOrderId: true,
        transferOrderId: true,
        ocNumero: true,
        tiendaNombre: true,
        asignadoAId: true,
        asignadoA: { select: { fullName: true } },
      },
    });
    if (!p) throw new NotFoundException('Pre-orden no encontrada.');
    const tipo: TipoPicking = p.canalDispatchOrderId ? 'posta' : 'traslado';
    const ordenId = (p.canalDispatchOrderId ?? p.transferOrderId)!;
    return { ...p, tipo, ordenId };
  }

  /** Netos reales ya registrados (pesados) en la orden para los códigos dados. */
  private async pesados(db: Db, tipo: TipoPicking, ordenId: string, codigos: string[]) {
    if (codigos.length === 0) return new Map<string, number>();
    const rows =
      tipo === 'posta'
        ? await db.dispatchProductItem.findMany({
            where: { canalDispatchOrderId: ordenId, codigo: { in: codigos } },
            select: { codigo: true, netoKg: true },
          })
        : await db.transferOrderItem.findMany({
            where: { transferOrderId: ordenId, codigo: { in: codigos } },
            select: { codigo: true, netoKg: true },
          });
    return new Map(rows.filter((r) => r.codigo).map((r) => [r.codigo!, Number(r.netoKg)]));
  }

  private resumen(p: PreordenRow, pesados: Map<string, number>) {
    const avance = avancePreorden(
      p.lineas.map((l) => ({
        productoId: l.productId,
        productoCodigo: l.product.codigo,
        productoNombre: l.product.nombre,
        plu: l.plu,
        productoCliente: l.productoCliente,
        kgPedidos: Number(l.kgPedidos),
      })),
      p.items.map((i) => ({
        productoId: i.productId,
        productoCodigo: i.product.codigo,
        productoNombre: i.product.nombre,
        netoEtiquetaKg: Number(i.netoEtiquetaKg),
        netoPesadoKg: pesados.get(i.codigo) ?? null,
      })),
    );
    return {
      id: p.id,
      nombre: nombrePreorden(p),
      ocNumero: p.ocNumero,
      tiendaCodigo: p.tiendaCodigo,
      tiendaNombre: p.tiendaNombre,
      observaciones: p.observaciones,
      asignado: p.asignadoA ? { id: p.asignadoA.id, nombre: p.asignadoA.fullName } : null,
      asignadoAt: p.asignadoAt?.toISOString() ?? null,
      status: p.status,
      terminadoAt: p.terminadoAt?.toISOString() ?? null,
      empaques: p.items.length,
      porPesar: p.items.filter((i) => !pesados.has(i.codigo)).length,
      ...avance.totales,
      avance: avance.lineas,
    };
  }

  /** Resumen de la orden: sus pre-órdenes con su avance y todas las etiquetas alistadas. */
  async obtener(ctx: AuthContext, tipoParam: string, ordenId: string) {
    const tipo = this.tipo(tipoParam);
    const o = await this.orden(ctx, tipo, ordenId);
    const rows = await this.prisma.picking.findMany({
      where: this.whereOrden(tipo, o.id),
      orderBy: [{ tiendaNombre: 'asc' }, { ocNumero: 'asc' }, { createdAt: 'asc' }],
      select: preordenSelect,
    });
    const pesados = await this.pesados(this.prisma, tipo, o.id, rows.flatMap((p) => p.items.map((i) => i.codigo)));
    const preordenes = rows.map((p) => this.resumen(p, pesados));
    const kgPedidos = preordenes.reduce((s, p) => s + p.kgPedidos, 0);
    const kgCumplidos = preordenes.reduce((s, p) => s + p.kgCumplidos, 0);
    return {
      orden: o.numero,
      ordenActiva: o.status === DispatchOrderStatus.activo,
      porcentaje: kgPedidos > 0 ? Math.round((kgCumplidos / kgPedidos) * 1000) / 10 : null,
      kgPedidos: r2(kgPedidos),
      preordenes,
      items: rows.flatMap((p) =>
        p.items.map((i) => ({
          ...itemDto(i, pesados.has(i.codigo)),
          preordenId: p.id,
          preorden: nombrePreorden(p),
          listo: p.status === PickingStatus.terminado,
        })),
      ),
    };
  }

  /** Detalle de una pre-orden: etiquetas y avance por producto contra la orden de compra. */
  async obtenerPreorden(ctx: AuthContext, id: string) {
    const ref = await this.preorden(ctx, id);
    const o = await this.orden(ctx, ref.tipo, ref.ordenId);
    const p = await this.prisma.picking.findUniqueOrThrow({ where: { id }, select: preordenSelect });
    const pesados = await this.pesados(this.prisma, ref.tipo, o.id, p.items.map((i) => i.codigo));
    return {
      ...this.resumen(p, pesados),
      orden: { tipo: ref.tipo, id: o.id, numero: o.numero, activa: o.status === DispatchOrderStatus.activo },
      items: p.items.map((i) => itemDto(i, pesados.has(i.codigo))),
    };
  }

  private async validarProductos(ctx: AuthContext, ids: string[]) {
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Hay productos repetidos en la orden de compra.');
    const validos = await this.prisma.product.count({ where: { id: { in: ids }, plantId: ctx.plantId } });
    if (validos !== ids.length) throw new BadRequestException('Hay productos que no existen en la planta.');
  }

  private async ocDuplicada(tipo: TipoPicking, ordenId: string, ocNumero: string | null, excepto?: string) {
    if (!ocNumero) return;
    const otra = await this.prisma.picking.findFirst({
      where: { ...this.whereOrden(tipo, ordenId), ocNumero, ...(excepto ? { id: { not: excepto } } : {}) },
      select: { id: true },
    });
    if (otra) throw new ConflictException(`La orden de compra ${ocNumero} ya tiene una pre-orden en esta orden.`);
  }

  /**
   * Crea una pre-orden. Sin orden de compra solo puede haber una por orden: si ya existe,
   * se devuelve esa (la terminal la crea al empezar a alistar sin OC).
   */
  async crearPreorden(ctx: AuthContext, tipoParam: string, ordenId: string, dto: GuardarPreordenDto) {
    const tipo = this.tipo(tipoParam);
    const o = await this.ordenActiva(ctx, tipo, ordenId);
    const ocNumero = texto(dto.ocNumero);
    await this.validarProductos(ctx, dto.lineas.map((l) => l.productoId));
    if (!ocNumero && dto.lineas.length === 0) {
      const general = await this.prisma.picking.findFirst({
        where: { ...this.whereOrden(tipo, o.id), ocNumero: null },
        select: { id: true },
      });
      if (general) return this.obtenerPreorden(ctx, general.id);
    }
    await this.ocDuplicada(tipo, o.id, ocNumero);
    const p = await this.prisma.picking.create({
      data: {
        plantId: ctx.plantId,
        canalDispatchOrderId: tipo === 'posta' ? o.id : null,
        transferOrderId: tipo === 'traslado' ? o.id : null,
        ocNumero,
        tiendaCodigo: texto(dto.tiendaCodigo),
        tiendaNombre: texto(dto.tiendaNombre),
        observaciones: texto(dto.observaciones),
        createdById: ctx.userId,
        lineas: { create: dto.lineas.map((l) => ({ productId: l.productoId, kgPedidos: l.kgPedidos })) },
      },
      select: { id: true },
    });
    return this.obtenerPreorden(ctx, p.id);
  }

  /** Cambia los datos de la pre-orden y reemplaza sus líneas (conserva el PLU del cliente). */
  async guardarPreorden(ctx: AuthContext, id: string, dto: GuardarPreordenDto) {
    const ref = await this.preorden(ctx, id);
    await this.ordenActiva(ctx, ref.tipo, ref.ordenId);
    const ocNumero = texto(dto.ocNumero);
    await this.validarProductos(ctx, dto.lineas.map((l) => l.productoId));
    await this.ocDuplicada(ref.tipo, ref.ordenId, ocNumero, id);
    await this.prisma.$transaction(async (tx) => {
      const previas = await tx.pickingLinea.findMany({
        where: { pickingId: id },
        select: { productId: true, plu: true, productoCliente: true },
      });
      const cliente = new Map(previas.map((l) => [l.productId, l]));
      await tx.picking.update({
        where: { id },
        data: {
          ocNumero,
          tiendaCodigo: texto(dto.tiendaCodigo),
          tiendaNombre: texto(dto.tiendaNombre),
          observaciones: texto(dto.observaciones),
        },
      });
      await tx.pickingLinea.deleteMany({ where: { pickingId: id } });
      await tx.pickingLinea.createMany({
        data: dto.lineas.map((l) => ({
          pickingId: id,
          productId: l.productoId,
          kgPedidos: l.kgPedidos,
          plu: cliente.get(l.productoId)?.plu ?? null,
          productoCliente: cliente.get(l.productoId)?.productoCliente ?? null,
        })),
      });
    });
    return this.obtenerPreorden(ctx, id);
  }

  async eliminarPreorden(ctx: AuthContext, id: string) {
    const ref = await this.preorden(ctx, id);
    await this.ordenActiva(ctx, ref.tipo, ref.ordenId);
    const items = await this.prisma.pickingItem.count({ where: { pickingId: id } });
    if (items > 0) {
      throw new BadRequestException(`La pre-orden ya tiene ${items} etiqueta(s) alistada(s): quítalas antes de eliminarla.`);
    }
    await this.prisma.picking.delete({ where: { id } });
    return { ok: true };
  }

  /**
   * Importa el Excel de órdenes de compra del cliente: una pre-orden por orden de compra
   * (tienda). Los PLU se traducen a productos propios con la equivalencia del cliente; si hay
   * PLU sin equivalencia no guarda nada y los devuelve para que el usuario escoja el producto.
   */
  async importar(ctx: AuthContext, tipoParam: string, ordenId: string, dto: ImportarOrdenesCompraDto) {
    const tipo = this.tipo(tipoParam);
    const o = await this.ordenActiva(ctx, tipo, ordenId);
    const filas = dto.filas.map((f) => ({
      ...f,
      ocNumero: f.ocNumero.trim(),
      plu: f.plu.trim(),
      tiendaCodigo: texto(f.tiendaCodigo),
      tiendaNombre: texto(f.tiendaNombre),
      producto: texto(f.producto),
    }));

    const mapeos = new Map((dto.mapeos ?? []).map((m) => [m.plu.trim(), m.productoId]));
    if (mapeos.size) await this.validarProductos(ctx, [...new Set(mapeos.values())]);

    const plus = [...new Set(filas.map((f) => f.plu))];
    const conocidos = await this.prisma.clientePlu.findMany({
      where: { clienteId: o.clienteId, plu: { in: plus }, product: { plantId: ctx.plantId } },
      select: { plu: true, productId: true },
    });
    const refs = await this.prisma.clienteProducto.findMany({
      where: { clienteId: o.clienteId, refPluSku: { in: plus }, product: { plantId: ctx.plantId } },
      select: { refPluSku: true, productId: true },
    });
    const producto = new Map<string, string>();
    for (const r of refs) if (r.refPluSku) producto.set(r.refPluSku, r.productId);
    for (const c of conocidos) producto.set(c.plu, c.productId);
    for (const [plu, id] of mapeos) producto.set(plu, id);

    const pendientes = plus
      .filter((plu) => !producto.has(plu))
      .map((plu) => ({ plu, producto: filas.find((f) => f.plu === plu)?.producto ?? null }));
    if (pendientes.length) return { pendientes, creadas: 0, actualizadas: 0 };

    // Agrupa por orden de compra; varios PLU del mismo producto suman sus kilos.
    const ocs = new Map<
      string,
      { tiendaCodigo: string | null; tiendaNombre: string | null; lineas: Map<string, { kg: number; plu: string; producto: string | null }> }
    >();
    for (const f of filas) {
      const oc = ocs.get(f.ocNumero) ?? { tiendaCodigo: f.tiendaCodigo, tiendaNombre: f.tiendaNombre, lineas: new Map() };
      const productId = producto.get(f.plu)!;
      const l = oc.lineas.get(productId);
      if (l) l.kg = r2(l.kg + f.kgPedidos);
      else oc.lineas.set(productId, { kg: f.kgPedidos, plu: f.plu, producto: f.producto });
      ocs.set(f.ocNumero, oc);
    }

    let creadas = 0;
    let actualizadas = 0;
    await this.prisma.$transaction(async (tx) => {
      for (const [plu, productId] of mapeos) {
        const descripcion = filas.find((f) => f.plu === plu)?.producto ?? null;
        await tx.clientePlu.upsert({
          where: { clienteId_plu: { clienteId: o.clienteId, plu } },
          create: { clienteId: o.clienteId, plu, productId, descripcion },
          update: { productId, descripcion },
        });
      }
      for (const [ocNumero, oc] of ocs) {
        const existente = await tx.picking.findFirst({
          where: { ...this.whereOrden(tipo, o.id), ocNumero },
          select: { id: true },
        });
        const pickingId = existente
          ? (
              await tx.picking.update({
                where: { id: existente.id },
                data: { tiendaCodigo: oc.tiendaCodigo, tiendaNombre: oc.tiendaNombre },
                select: { id: true },
              })
            ).id
          : (
              await tx.picking.create({
                data: {
                  plantId: ctx.plantId,
                  canalDispatchOrderId: tipo === 'posta' ? o.id : null,
                  transferOrderId: tipo === 'traslado' ? o.id : null,
                  ocNumero,
                  tiendaCodigo: oc.tiendaCodigo,
                  tiendaNombre: oc.tiendaNombre,
                  createdById: ctx.userId,
                },
                select: { id: true },
              })
            ).id;
        if (existente) actualizadas += 1;
        else creadas += 1;
        await tx.pickingLinea.deleteMany({ where: { pickingId } });
        await tx.pickingLinea.createMany({
          data: [...oc.lineas].map(([productId, l]) => ({
            pickingId,
            productId,
            kgPedidos: l.kg,
            plu: l.plu,
            productoCliente: l.producto,
          })),
        });
      }
    });
    return { pendientes: [], creadas, actualizadas };
  }

  /**
   * Códigos que chocan con la etiqueta: ella misma, la canastilla de una pieza o las piezas
   * de una canastilla (no pueden alistarse por separado).
   */
  private async relacionados(db: Db, info: { codigo: string; etiquetaId: string | null; canastillaId: string | null }) {
    const codigos = [info.codigo];
    if (info.etiquetaId) {
      const e = await db.rotuladoEtiqueta.findUnique({
        where: { id: info.etiquetaId },
        select: { canastilla: { select: { codigo: true } } },
      });
      if (e?.canastilla?.codigo) codigos.push(e.canastilla.codigo);
    }
    if (info.canastillaId) {
      const piezas = await db.rotuladoEtiqueta.findMany({
        where: { canastillaId: info.canastillaId, deletedAt: null, codigo: { not: null } },
        select: { codigo: true },
      });
      for (const p of piezas) if (p.codigo) codigos.push(p.codigo);
    }
    return codigos;
  }

  /** Aviso al alistar un producto: fuera de la orden de compra, recién completado o excedido. */
  private async avisoPedido(pickingId: string, productId: string, kgNuevo: number): Promise<AvisoPedido | null> {
    const lineas = await this.prisma.pickingLinea.findMany({
      where: { pickingId },
      select: { productId: true, kgPedidos: true, product: { select: { nombre: true } } },
    });
    if (lineas.length === 0) return null;
    const l = lineas.find((x) => x.productId === productId);
    if (!l) {
      const p = await this.prisma.product.findUnique({ where: { id: productId }, select: { nombre: true } });
      return { tipo: 'fuera', mensaje: `${p?.nombre ?? 'El producto'} no está en la orden de compra.` };
    }
    const suma = await this.prisma.pickingItem.aggregate({
      where: { pickingId, productId },
      _sum: { netoEtiquetaKg: true },
    });
    const pedido = Number(l.kgPedidos);
    const alistado = r2(Number(suma._sum.netoEtiquetaKg ?? 0));
    const antes = r2(alistado - kgNuevo);
    if (alistado > pedido) {
      return {
        tipo: 'excedido',
        mensaje: `${l.product.nombre}: ${fmtKg(alistado)} de ${fmtKg(pedido)} kg pedidos (se pasa ${fmtKg(r2(alistado - pedido))} kg).`,
      };
    }
    if (alistado >= pedido && antes < pedido) {
      return { tipo: 'completo', mensaje: `${l.product.nombre} completo: ${fmtKg(alistado)} de ${fmtKg(pedido)} kg.` };
    }
    return null;
  }

  async agregar(ctx: AuthContext, preordenId: string, dto: AgregarPickingDto) {
    const ref = await this.preorden(ctx, preordenId);
    exigirAsignada(ctx, ref);
    const tipo = ref.tipo;
    const o = await this.ordenActiva(ctx, tipo, ref.ordenId);
    const codigo = dto.codigo.trim().toUpperCase();
    if (tipo === 'traslado' && !CODIGO_TRASLADO.test(codigo)) {
      throw new BadRequestException('Código de barras no válido: en traslado solo van piezas o canastillas de Rotulado.');
    }
    // Valida cliente, que exista y que no esté ya despachado/trasladado.
    const info =
      tipo === 'posta'
        ? await this.posta.buscar(ctx, o.id, codigo)
        : await this.traslado.buscarEtiqueta(ctx, o.id, codigo);

    const item = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`picking:${ctx.plantId}`}))`;
      const picking = await tx.picking.findUniqueOrThrow({
        where: { id: preordenId },
        select: { status: true, asignadoAId: true, asignadoA: { select: { fullName: true } } },
      });
      exigirAsignada(ctx, picking);
      if (picking.status === PickingStatus.terminado) {
        throw new BadRequestException('La pre-orden ya está terminada: reábrela para seguir alistando.');
      }

      const codigos = await this.relacionados(tx, info);
      const choque = await tx.pickingItem.findFirst({
        where: { codigo: { in: codigos }, picking: { plantId: ctx.plantId, ...pickingActivo } },
        select: {
          codigo: true,
          picking: {
            select: {
              id: true,
              ocNumero: true,
              tiendaNombre: true,
              canalDispatchOrder: { select: { dcNumber: true } },
              transferOrder: { select: { otNumber: true } },
            },
          },
        },
      });
      if (choque) {
        const pk = choque.picking;
        const orden = pk.canalDispatchOrder ? `DC${pk.canalDispatchOrder.dcNumber}` : `OT${pk.transferOrder?.otNumber}`;
        const donde = pk.id === preordenId ? 'esta pre-orden' : `la pre-orden ${nombrePreorden(pk)} de ${orden}`;
        if (choque.codigo === info.codigo) throw new ConflictException(`${info.codigo} ya está alistada en ${donde}.`);
        const que = info.tipo === 'canastilla' ? 'Una pieza de esta canastilla' : 'La canastilla de esta pieza';
        throw new ConflictException(`${que} ya está alistada en ${donde}.`);
      }

      return tx.pickingItem.create({
        data: {
          pickingId: preordenId,
          codigo: info.codigo,
          tipo: info.tipo,
          productId: info.productId,
          unds: info.unds,
          netoEtiquetaKg: info.netoEtiquetaKg,
          createdById: ctx.userId,
        },
        select: itemSelect,
      });
    });
    const avisoPedido = await this.avisoPedido(preordenId, info.productId, Number(item.netoEtiquetaKg));
    return { ...itemDto(item, false), advertenciaInventario: info.advertenciaInventario, avisoPedido };
  }

  async quitar(ctx: AuthContext, itemId: string) {
    const item = await this.prisma.pickingItem.findFirst({
      where: { id: itemId, picking: { plantId: ctx.plantId } },
      select: {
        id: true,
        codigo: true,
        picking: {
          select: {
            status: true,
            canalDispatchOrderId: true,
            transferOrderId: true,
            asignadoAId: true,
            asignadoA: { select: { fullName: true } },
          },
        },
      },
    });
    if (!item) throw new NotFoundException('Etiqueta no encontrada en el picking.');
    exigirAsignada(ctx, item.picking);
    if (item.picking.status === PickingStatus.terminado) {
      throw new BadRequestException('La pre-orden está terminada: reábrela para quitar etiquetas.');
    }
    const tipo: TipoPicking = item.picking.canalDispatchOrderId ? 'posta' : 'traslado';
    const ordenId = (item.picking.canalDispatchOrderId ?? item.picking.transferOrderId)!;
    const pesados = await this.pesados(this.prisma, tipo, ordenId, [item.codigo]);
    if (pesados.size > 0) {
      throw new BadRequestException('La etiqueta ya fue pesada en la orden: quítala primero de la orden.');
    }
    await this.prisma.pickingItem.delete({ where: { id: item.id } });
    return { ok: true };
  }

  /** Asigna la pre-orden al alistador (si está libre o ya es suya). */
  async asignar(ctx: AuthContext, id: string) {
    const ref = await this.preorden(ctx, id);
    await this.ordenActiva(ctx, ref.tipo, ref.ordenId);
    if (ref.asignadoAId === ctx.userId) return { ok: true };
    const r = await this.prisma.picking.updateMany({
      where: { id, asignadoAId: null },
      data: { asignadoAId: ctx.userId, asignadoAt: new Date() },
    });
    if (r.count === 0) {
      const p = await this.prisma.picking.findUnique({ where: { id }, select: { asignadoA: { select: { fullName: true } } } });
      throw new ConflictException(`La pre-orden ya está asignada a ${p?.asignadoA?.fullName ?? 'otro alistador'}.`);
    }
    return { ok: true };
  }

  /** Libera la pre-orden: el alistador asignado, o un supervisor/admin para destrabarla. */
  async liberar(ctx: AuthContext, id: string) {
    const ref = await this.preorden(ctx, id);
    if (!ref.asignadoAId) return { ok: true };
    if (ref.asignadoAId !== ctx.userId && !ROLES_LIBERAN.includes(ctx.role)) {
      throw new ForbiddenException(`Solo ${ref.asignadoA?.fullName ?? 'el alistador asignado'} o un supervisor puede liberarla.`);
    }
    await this.prisma.picking.update({ where: { id }, data: { asignadoAId: null, asignadoAt: null } });
    return { ok: true };
  }

  async terminar(ctx: AuthContext, id: string) {    const ref = await this.preorden(ctx, id);
    exigirAsignada(ctx, ref);
    await this.ordenActiva(ctx, ref.tipo, ref.ordenId);
    const items = await this.prisma.pickingItem.count({ where: { pickingId: id } });
    if (items === 0) throw new BadRequestException('La pre-orden no tiene etiquetas.');
    if (ref.status === PickingStatus.terminado) throw new BadRequestException('La pre-orden ya está terminada.');
    await this.prisma.picking.update({
      where: { id },
      data: { status: PickingStatus.terminado, terminadoAt: new Date(), terminadoById: ctx.userId },
    });
    return { ok: true };
  }

  async reabrir(ctx: AuthContext, id: string) {
    const ref = await this.preorden(ctx, id);
    exigirAsignada(ctx, ref);
    await this.ordenActiva(ctx, ref.tipo, ref.ordenId);
    if (ref.status !== PickingStatus.terminado) throw new BadRequestException('La pre-orden no está terminada.');
    await this.prisma.picking.update({
      where: { id },
      data: { status: PickingStatus.en_curso, terminadoAt: null, terminadoById: null },
    });
    return { ok: true };
  }

  /**
   * Pesa un arrume (canastillas de pre-órdenes terminadas de la orden) y registra sus etiquetas
   * en la orden repartiendo el neto y la tara en proporción al neto de cada etiqueta.
   */
  async arrume(ctx: AuthContext, tipoParam: string, ordenId: string, dto: RegistrarArrumeDto) {
    const tipo = this.tipo(tipoParam);
    const o = await this.ordenActiva(ctx, tipo, ordenId);
    const items = await this.prisma.pickingItem.findMany({
      where: { picking: this.whereOrden(tipo, o.id) },
      select: { codigo: true, netoEtiquetaKg: true, picking: { select: { status: true, ocNumero: true, tiendaNombre: true } } },
    });
    if (items.length === 0) throw new BadRequestException('La orden no tiene picking.');

    const porCodigo = new Map(items.map((i) => [i.codigo, i]));
    const codigos = dto.codigos.map((c) => c.trim().toUpperCase());
    const fuera = codigos.find((c) => !porCodigo.has(c));
    if (fuera) throw new BadRequestException(`${fuera} no está en el picking de la orden.`);
    const enCurso = codigos.find((c) => porCodigo.get(c)!.picking.status !== PickingStatus.terminado);
    if (enCurso) {
      throw new BadRequestException(
        `${enCurso} es de la pre-orden ${nombrePreorden(porCodigo.get(enCurso)!.picking)}, que aún está en curso: el alistador debe terminarla antes de pesar.`,
      );
    }
    const yaPesados = await this.pesados(this.prisma, tipo, o.id, codigos);
    if (yaPesados.size > 0) throw new BadRequestException(`${[...yaPesados.keys()][0]} ya fue pesada.`);

    const taraTotalKg = Number((dto.taraCanastillaKg * dto.canastillas + dto.taraEstibaKg).toFixed(2));
    const netoTotalKg = Number((dto.pesoBrutoKg - taraTotalKg).toFixed(2));
    if (netoTotalKg <= 0) throw new BadRequestException('El peso bruto debe ser mayor que la tara.');

    const netosEtiqueta = codigos.map((c) => Number(porCodigo.get(c)!.netoEtiquetaKg));
    let lineas;
    try {
      lineas = repartirArrume(netosEtiqueta, netoTotalKg, taraTotalKg);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
    const registro = codigos.map((codigo, i) => ({ codigo, pesoKg: lineas[i].pesoKg, taraKg: lineas[i].taraKg }));
    const registrados =
      tipo === 'posta'
        ? await this.posta.registrarVarios(ctx, o.id, registro)
        : await this.traslado.registrarVarios(ctx, o.id, registro);

    const netoEtiquetasKg = Number(netosEtiqueta.reduce((a, b) => a + b, 0).toFixed(2));
    return {
      items: registrados,
      pesoBrutoKg: dto.pesoBrutoKg,
      taraTotalKg,
      netoTotalKg,
      netoEtiquetasKg,
      diferenciaKg: Number((netoTotalKg - netoEtiquetasKg).toFixed(2)),
    };
  }
}

export type { LineaAvance };
