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

type Db = Prisma.TransactionClient;
type OrdenPosta = { id: string; clienteId: string; status: DispatchOrderStatus };

const numero = (prefijo: string) => (n: number) => `${prefijo}${String(n).padStart(7, '0')}`;
const formatOT = numero('OT');
const formatDC = numero('DC');

const otSelect = { select: { transferOrder: { select: { otNumber: true } } } } as const;
const dcSelect = { select: { canalDispatchOrder: { select: { dcNumber: true } } } } as const;

const itemSelect = {
  id: true,
  codigo: true,
  etiquetaId: true,
  canastillaId: true,
  unds: true,
  pesoKg: true,
  taraKg: true,
  netoKg: true,
  netoEtiquetaKg: true,
  createdAt: true,
  product: { select: { codigo: true, nombre: true } },
} as const;

const itemDto = (i: Prisma.DispatchProductItemGetPayload<{ select: typeof itemSelect }>) => ({
  id: i.id,
  codigo: i.codigo,
  tipo: i.canastillaId ? ('canastilla' as const) : ('pieza' as const),
  productoCodigo: i.product.codigo,
  productoNombre: i.product.nombre,
  unds: i.unds,
  pesoKg: Number(i.pesoKg),
  taraKg: Number(i.taraKg),
  netoKg: Number(i.netoKg),
  netoEtiquetaKg: Number(i.netoEtiquetaKg),
  createdAt: i.createdAt.toISOString(),
});

/**
 * Despacho Posta: se despachan productos rotulados (piezas, canastillas o etiquetas de
 * acondicionamiento) de la orden DC; las canales no se despachan aquí.
 */
@Injectable()
export class DespachoPostaService {
  constructor(private readonly prisma: PrismaService) {}

  private async orden(ctx: AuthContext, id: string): Promise<OrdenPosta> {
    const dc = await this.prisma.canalDispatchOrder.findFirst({
      where: { id, plantId: ctx.plantId, deletedAt: null },
      select: { id: true, clienteId: true, status: true, tipo: true },
    });
    if (!dc) throw new NotFoundException('Orden de despacho no encontrada.');
    if (dc.tipo !== 'posta') throw new BadRequestException('La orden no es de despacho posta.');
    return dc;
  }

  private async resolver(db: Db, ctx: AuthContext, dc: OrdenPosta, codigo: string) {
    const valor = codigo.trim().toUpperCase();
    if (parseCanalBarcode(valor)) {
      throw new BadRequestException('Las canales no se despachan en Despacho Posta; usa Despacho Caliente o Frío.');
    }
    const ya = (n: number) => `ya está en la orden de despacho ${formatDC(n)}`;
    const enProceso = (n: number) => `está en proceso en la orden de traslado ${formatOT(n)}`;

    // Etiqueta de Rotulado Acondicionamiento: A + OC + producto + pieza.
    if (/^A\d+$/.test(valor)) {
      const e = await db.acondicionamientoEtiqueta.findFirst({
        where: { codigo: valor, plantId: ctx.plantId, deletedAt: null },
        select: {
          id: true,
          pieza: true,
          netoKg: true,
          productId: true,
          conditioningOrder: { select: { clienteId: true } },
          despacho: dcSelect,
          product: { select: { codigo: true, nombre: true } },
        },
      });
      if (!e) throw new NotFoundException(`No se encontró la etiqueta ${valor} (o fue borrada).`);
      if (e.conditioningOrder.clienteId !== dc.clienteId) {
        throw new BadRequestException('La etiqueta es de otro cliente.');
      }
      if (e.despacho) throw new ConflictException(`La pieza #${e.pieza} ${ya(e.despacho.canalDispatchOrder.dcNumber)}.`);
      return {
        tipo: 'pieza' as const,
        etiquetaId: null,
        canastillaId: null,
        acondEtiquetaId: e.id,
        codigo: valor,
        productId: e.productId,
        productoCodigo: e.product.codigo,
        productoNombre: e.product.nombre,
        pieza: e.pieza,
        canastillaNumero: null,
        unds: 1,
        netoEtiquetaKg: Number(e.netoKg),
      };
    }

    if (!/^\d{7}\d+(\d{4}|C\d{3})$/.test(valor)) {
      throw new BadRequestException('Código de barras no válido.');
    }

    if (valor.includes('C')) {
      const c = await db.rotuladoCanastilla.findFirst({
        where: { codigo: valor, plantId: ctx.plantId },
        select: {
          id: true,
          numero: true,
          cerradaAt: true,
          productId: true,
          unds: true,
          netoKg: true,
          productionOrder: { select: { clienteId: true } },
          traslado: otSelect,
          despacho: dcSelect,
          etiquetas: {
            where: {
              deletedAt: null,
              OR: [{ traslado: { isNot: null } }, { despacho: { isNot: null } }],
            },
            select: { pieza: true, traslado: otSelect, despacho: dcSelect },
            take: 1,
          },
        },
      });
      if (!c) throw new NotFoundException(`No se encontró la canastilla ${valor}.`);
      if (!c.cerradaAt) throw new BadRequestException(`La canastilla N.º ${c.numero} aún no está cerrada.`);
      if (c.productionOrder.clienteId !== dc.clienteId) {
        throw new BadRequestException('La canastilla es de otro cliente.');
      }
      if (c.despacho) throw new ConflictException(`La canastilla ${ya(c.despacho.canalDispatchOrder.dcNumber)}.`);
      if (c.traslado) throw new ConflictException(`La canastilla ${enProceso(c.traslado.transferOrder.otNumber)}.`);
      const pieza = c.etiquetas[0];
      if (pieza?.despacho) {
        throw new ConflictException(`La pieza #${pieza.pieza} de esta canastilla ${ya(pieza.despacho.canalDispatchOrder.dcNumber)}.`);
      }
      if (pieza?.traslado) {
        throw new ConflictException(`La pieza #${pieza.pieza} de esta canastilla ${enProceso(pieza.traslado.transferOrder.otNumber)}.`);
      }
      const product = await db.product.findUniqueOrThrow({
        where: { id: c.productId },
        select: { codigo: true, nombre: true },
      });
      return {
        tipo: 'canastilla' as const,
        etiquetaId: null,
        canastillaId: c.id,
        acondEtiquetaId: null,
        codigo: valor,
        productId: c.productId,
        productoCodigo: product.codigo,
        productoNombre: product.nombre,
        pieza: null,
        canastillaNumero: c.numero,
        unds: c.unds ?? 0,
        netoEtiquetaKg: Number(c.netoKg ?? 0),
      };
    }

    const e = await db.rotuladoEtiqueta.findFirst({
      where: { codigo: valor, plantId: ctx.plantId, deletedAt: null },
      select: {
        id: true,
        pieza: true,
        netoKg: true,
        productId: true,
        productionOrder: { select: { clienteId: true } },
        traslado: otSelect,
        despacho: dcSelect,
        canastilla: { select: { numero: true, traslado: otSelect, despacho: dcSelect } },
        product: { select: { codigo: true, nombre: true } },
      },
    });
    if (!e) throw new NotFoundException(`No se encontró la etiqueta ${valor} (o fue borrada).`);
    if (e.productionOrder.clienteId !== dc.clienteId) {
      throw new BadRequestException('La etiqueta es de otro cliente.');
    }
    if (e.despacho) throw new ConflictException(`La pieza #${e.pieza} ${ya(e.despacho.canalDispatchOrder.dcNumber)}.`);
    if (e.traslado) throw new ConflictException(`La pieza #${e.pieza} ${enProceso(e.traslado.transferOrder.otNumber)}.`);
    if (e.canastilla?.despacho) {
      throw new ConflictException(
        `La pieza #${e.pieza} va en la canastilla N.º ${e.canastilla.numero}, que ${ya(e.canastilla.despacho.canalDispatchOrder.dcNumber)}.`,
      );
    }
    if (e.canastilla?.traslado) {
      throw new ConflictException(
        `La pieza #${e.pieza} va en la canastilla N.º ${e.canastilla.numero}, que ${enProceso(e.canastilla.traslado.transferOrder.otNumber)}.`,
      );
    }
    return {
      tipo: 'pieza' as const,
      etiquetaId: e.id,
      canastillaId: null,
      acondEtiquetaId: null,
      codigo: valor,
      productId: e.productId,
      productoCodigo: e.product.codigo,
      productoNombre: e.product.nombre,
      pieza: e.pieza,
      canastillaNumero: e.canastilla?.numero ?? null,
      unds: 1,
      netoEtiquetaKg: Number(e.netoKg),
    };
  }

  async buscar(ctx: AuthContext, id: string, codigo: string) {
    const dc = await this.orden(ctx, id);
    return this.resolver(this.prisma, ctx, dc, codigo);
  }

  /** Registra el producto con el peso nuevo (neto = peso - tara). */
  async registrar(ctx: AuthContext, id: string, dto: { codigo: string; pesoKg: number; taraKg: number }) {
    const dc = await this.orden(ctx, id);
    if (dc.status !== DispatchOrderStatus.activo) {
      throw new BadRequestException('La orden de despacho no está activa.');
    }
    const neto = Number((dto.pesoKg - dto.taraKg).toFixed(2));
    if (neto <= 0) throw new BadRequestException('El peso neto debe ser mayor que cero.');

    try {
      const item = await this.prisma.$transaction(async (tx) => {
        // Comparte el candado con Traslado: una pieza no puede ir a los dos a la vez.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`traslado:${ctx.plantId}`}))`;
        const info = await this.resolver(tx, ctx, dc, dto.codigo);
        return tx.dispatchProductItem.create({
          data: {
            canalDispatchOrderId: dc.id,
            etiquetaId: info.etiquetaId,
            canastillaId: info.canastillaId,
            acondEtiquetaId: info.acondEtiquetaId,
            codigo: info.codigo,
            productId: info.productId,
            unds: info.unds,
            pesoKg: dto.pesoKg,
            taraKg: dto.taraKg,
            netoKg: neto,
            netoEtiquetaKg: info.netoEtiquetaKg,
            createdById: ctx.userId,
          },
          select: itemSelect,
        });
      });
      return itemDto(item);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`El código ${dto.codigo} ya fue despachado.`);
      }
      throw err;
    }
  }

  async items(ctx: AuthContext, id: string) {
    await this.orden(ctx, id);
    const rows = await this.prisma.dispatchProductItem.findMany({
      where: { canalDispatchOrderId: id },
      orderBy: { createdAt: 'desc' },
      select: itemSelect,
    });
    return rows.map(itemDto);
  }

  async quitar(ctx: AuthContext, itemId: string) {
    const item = await this.prisma.dispatchProductItem.findFirst({
      where: { id: itemId, canalDispatchOrder: { plantId: ctx.plantId, deletedAt: null } },
      select: { id: true, canalDispatchOrder: { select: { status: true } } },
    });
    if (!item) throw new NotFoundException('Registro no encontrado.');
    if (item.canalDispatchOrder.status !== DispatchOrderStatus.activo) {
      throw new BadRequestException('La orden de despacho no está activa.');
    }
    await this.prisma.dispatchProductItem.delete({ where: { id: item.id } });
    return { ok: true };
  }
}
