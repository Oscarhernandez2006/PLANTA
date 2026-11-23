import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DispatchOrderStatus, PickingStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthContext } from '../../common/auth/auth-context';
import { DespachoPostaService } from '../canal-dispatch-order/despacho-posta.service';
import { TransferOrderService } from '../transfer-order/transfer-order.service';
import type { AgregarPickingDto, RegistrarArrumeDto } from './picking.dto';
import { repartirArrume } from './repartir-arrume';

export const TIPOS_PICKING = ['posta', 'traslado'] as const;
export type TipoPicking = (typeof TIPOS_PICKING)[number];

type Db = Prisma.TransactionClient;
type Orden = { id: string; numero: string; status: DispatchOrderStatus };

// Código de barras de 8 dígitos (pieza o canastilla de Rotulado), único válido en traslado.
const CODIGO_TRASLADO = /^[1-9]\d{7}$/;

const itemSelect = {
  id: true,
  codigo: true,
  tipo: true,
  unds: true,
  netoEtiquetaKg: true,
  createdAt: true,
  product: { select: { codigo: true, nombre: true } },
} as const;

const itemDto = (i: Prisma.PickingItemGetPayload<{ select: typeof itemSelect }>, pesado: boolean) => ({
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

// Picking de una orden activa (no anulada): sus etiquetas están reservadas.
const pickingActivo: Prisma.PickingWhereInput = {
  OR: [
    { canalDispatchOrder: { status: DispatchOrderStatus.activo, deletedAt: null } },
    { transferOrder: { status: DispatchOrderStatus.activo, deletedAt: null } },
  ],
};

/**
 * Picking (pre-orden): el alistador pistolea en la terminal las etiquetas que salen de la
 * cava para una orden de despacho posta o de traslado. No mueve inventario; las etiquetas
 * se registran en la orden cuando se pesa el arrume en el escritorio (re-pesaje por merma).
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
        select: { id: true, dcNumber: true, status: true },
      });
      if (!dc) throw new NotFoundException('Orden de despacho posta no encontrada.');
      return { id: dc.id, numero: `DC${dc.dcNumber}`, status: dc.status };
    }
    const ot = await this.prisma.transferOrder.findFirst({
      where: { id, plantId: ctx.plantId, deletedAt: null },
      select: { id: true, otNumber: true, status: true },
    });
    if (!ot) throw new NotFoundException('Orden de traslado no encontrada.');
    return { id: ot.id, numero: `OT${ot.otNumber}`, status: ot.status };
  }

  private async ordenActiva(ctx: AuthContext, tipo: TipoPicking, id: string) {
    const o = await this.orden(ctx, tipo, id);
    if (o.status !== DispatchOrderStatus.activo) {
      throw new BadRequestException(`La orden ${o.numero} no está activa.`);
    }
    return o;
  }

  private whereOrden(tipo: TipoPicking, ordenId: string): Prisma.PickingWhereUniqueInput {
    return tipo === 'posta' ? { canalDispatchOrderId: ordenId } : { transferOrderId: ordenId };
  }

  /** Códigos de la orden ya registrados (pesados) entre los dados. */
  private async pesados(db: Db, tipo: TipoPicking, ordenId: string, codigos: string[]) {
    if (codigos.length === 0) return new Set<string>();
    const rows =
      tipo === 'posta'
        ? await db.dispatchProductItem.findMany({
            where: { canalDispatchOrderId: ordenId, codigo: { in: codigos } },
            select: { codigo: true },
          })
        : await db.transferOrderItem.findMany({
            where: { transferOrderId: ordenId, codigo: { in: codigos } },
            select: { codigo: true },
          });
    return new Set(rows.map((r) => r.codigo));
  }

  async obtener(ctx: AuthContext, tipoParam: string, ordenId: string) {
    const tipo = this.tipo(tipoParam);
    const o = await this.orden(ctx, tipo, ordenId);
    const p = await this.prisma.picking.findUnique({
      where: this.whereOrden(tipo, o.id),
      select: {
        id: true,
        status: true,
        terminadoAt: true,
        items: { orderBy: { createdAt: 'desc' }, select: itemSelect },
      },
    });
    const pesados = await this.pesados(this.prisma, tipo, o.id, p?.items.map((i) => i.codigo) ?? []);
    return {
      id: p?.id ?? null,
      orden: o.numero,
      ordenActiva: o.status === DispatchOrderStatus.activo,
      status: p?.status ?? PickingStatus.en_curso,
      terminadoAt: p?.terminadoAt?.toISOString() ?? null,
      items: (p?.items ?? []).map((i) => itemDto(i, pesados.has(i.codigo))),
    };
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

  async agregar(ctx: AuthContext, tipoParam: string, ordenId: string, dto: AgregarPickingDto) {
    const tipo = this.tipo(tipoParam);
    const o = await this.ordenActiva(ctx, tipo, ordenId);
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
      const picking = await tx.picking.findUnique({
        where: this.whereOrden(tipo, o.id),
        select: { id: true, status: true },
      });
      if (picking?.status === PickingStatus.terminado) {
        throw new BadRequestException('El picking ya está terminado: reábrelo para seguir alistando.');
      }

      const codigos = await this.relacionados(tx, info);
      const choque = await tx.pickingItem.findFirst({
        where: { codigo: { in: codigos }, picking: { plantId: ctx.plantId, ...pickingActivo } },
        select: {
          codigo: true,
          picking: {
            select: {
              id: true,
              canalDispatchOrder: { select: { dcNumber: true } },
              transferOrder: { select: { otNumber: true } },
            },
          },
        },
      });
      if (choque) {
        const pk = choque.picking;
        const donde = pk.canalDispatchOrder ? `DC${pk.canalDispatchOrder.dcNumber}` : `OT${pk.transferOrder?.otNumber}`;
        const mismo = pk.id === picking?.id;
        if (choque.codigo === info.codigo) {
          throw new ConflictException(mismo ? `${info.codigo} ya está en este picking.` : `${info.codigo} ya está alistada en el picking de ${donde}.`);
        }
        const que = info.tipo === 'canastilla' ? 'Una pieza de esta canastilla' : 'La canastilla de esta pieza';
        throw new ConflictException(`${que} ya está alistada en el picking ${mismo ? 'de esta orden' : `de ${donde}`}.`);
      }

      const pickingId =
        picking?.id ??
        (
          await tx.picking.create({
            data: {
              plantId: ctx.plantId,
              canalDispatchOrderId: tipo === 'posta' ? o.id : null,
              transferOrderId: tipo === 'traslado' ? o.id : null,
              createdById: ctx.userId,
            },
            select: { id: true },
          })
        ).id;

      return tx.pickingItem.create({
        data: {
          pickingId,
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
    return { ...itemDto(item, false), advertenciaInventario: info.advertenciaInventario };
  }

  async quitar(ctx: AuthContext, itemId: string) {
    const item = await this.prisma.pickingItem.findFirst({
      where: { id: itemId, picking: { plantId: ctx.plantId } },
      select: {
        id: true,
        codigo: true,
        picking: { select: { status: true, canalDispatchOrderId: true, transferOrderId: true } },
      },
    });
    if (!item) throw new NotFoundException('Etiqueta no encontrada en el picking.');
    if (item.picking.status === PickingStatus.terminado) {
      throw new BadRequestException('El picking está terminado: reábrelo para quitar etiquetas.');
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

  async terminar(ctx: AuthContext, tipoParam: string, ordenId: string) {
    const tipo = this.tipo(tipoParam);
    const o = await this.ordenActiva(ctx, tipo, ordenId);
    const p = await this.prisma.picking.findUnique({
      where: this.whereOrden(tipo, o.id),
      select: { id: true, status: true, _count: { select: { items: true } } },
    });
    if (!p || p._count.items === 0) throw new BadRequestException('El picking no tiene etiquetas.');
    if (p.status === PickingStatus.terminado) throw new BadRequestException('El picking ya está terminado.');
    await this.prisma.picking.update({
      where: { id: p.id },
      data: { status: PickingStatus.terminado, terminadoAt: new Date(), terminadoById: ctx.userId },
    });
    return { ok: true };
  }

  async reabrir(ctx: AuthContext, tipoParam: string, ordenId: string) {
    const tipo = this.tipo(tipoParam);
    const o = await this.ordenActiva(ctx, tipo, ordenId);
    const p = await this.prisma.picking.findUnique({
      where: this.whereOrden(tipo, o.id),
      select: { id: true, status: true },
    });
    if (!p || p.status !== PickingStatus.terminado) throw new BadRequestException('El picking no está terminado.');
    await this.prisma.picking.update({
      where: { id: p.id },
      data: { status: PickingStatus.en_curso, terminadoAt: null, terminadoById: null },
    });
    return { ok: true };
  }

  /**
   * Pesa un arrume (todas o parte de las canastillas del picking) y registra sus etiquetas en
   * la orden repartiendo el neto y la tara en proporción al neto de cada etiqueta.
   */
  async arrume(ctx: AuthContext, tipoParam: string, ordenId: string, dto: RegistrarArrumeDto) {
    const tipo = this.tipo(tipoParam);
    const o = await this.ordenActiva(ctx, tipo, ordenId);
    const p = await this.prisma.picking.findUnique({
      where: this.whereOrden(tipo, o.id),
      select: { status: true, items: { select: { codigo: true, netoEtiquetaKg: true } } },
    });
    if (!p) throw new BadRequestException('La orden no tiene picking.');
    if (p.status !== PickingStatus.terminado) {
      throw new BadRequestException('El picking aún está en curso: el alistador debe terminarlo antes de pesar.');
    }

    const porCodigo = new Map(p.items.map((i) => [i.codigo, Number(i.netoEtiquetaKg)]));
    const codigos = dto.codigos.map((c) => c.trim().toUpperCase());
    const fuera = codigos.find((c) => !porCodigo.has(c));
    if (fuera) throw new BadRequestException(`${fuera} no está en el picking de la orden.`);
    const yaPesados = await this.pesados(this.prisma, tipo, o.id, codigos);
    if (yaPesados.size > 0) throw new BadRequestException(`${[...yaPesados][0]} ya fue pesada.`);

    const taraTotalKg = Number((dto.taraCanastillaKg * dto.canastillas + dto.taraEstibaKg).toFixed(2));
    const netoTotalKg = Number((dto.pesoBrutoKg - taraTotalKg).toFixed(2));
    if (netoTotalKg <= 0) throw new BadRequestException('El peso bruto debe ser mayor que la tara.');

    const netosEtiqueta = codigos.map((c) => porCodigo.get(c)!);
    let lineas;
    try {
      lineas = repartirArrume(netosEtiqueta, netoTotalKg, taraTotalKg);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
    const registro = codigos.map((codigo, i) => ({ codigo, pesoKg: lineas[i].pesoKg, taraKg: lineas[i].taraKg }));
    const items =
      tipo === 'posta'
        ? await this.posta.registrarVarios(ctx, o.id, registro)
        : await this.traslado.registrarVarios(ctx, o.id, registro);

    const netoEtiquetasKg = Number(netosEtiqueta.reduce((a, b) => a + b, 0).toFixed(2));
    return {
      items,
      pesoBrutoKg: dto.pesoBrutoKg,
      taraTotalKg,
      netoTotalKg,
      netoEtiquetasKg,
      diferenciaKg: Number((netoTotalKg - netoEtiquetasKg).toFixed(2)),
    };
  }
}
