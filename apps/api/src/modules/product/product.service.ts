import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthContext } from '../../common/auth/auth-context';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';

const productSelect = {
  id: true,
  codigo: true,
  nombre: true,
  categoria: true,
  active: true,
} as const;

@Injectable()
export class ProductService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(ctx: AuthContext, search?: string, todos = false) {
    const q = search?.trim();
    return this.prisma.product.findMany({
      where: {
        plantId: ctx.plantId,
        ...(todos ? {} : { active: true }),
        ...(q
          ? {
              OR: [
                { nombre: { contains: q, mode: 'insensitive' } },
                { codigo: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: productSelect,
      orderBy: todos ? [{ categoria: 'asc' }, { codigo: 'asc' }] : { nombre: 'asc' },
      take: todos ? 1000 : 200,
    });
  }

  /** Siguiente código (solo previsualización; el definitivo se asigna al guardar). */
  async nextCode(ctx: AuthContext) {
    return { next: await this.siguienteCodigo(this.prisma, ctx.plantId) };
  }

  /** Etiquetas disponibles en planta (sin trasladar ni despachar) de cada producto. */
  async existencias(ctx: AuthContext) {
    const filas = await this.prisma.rotuladoEtiqueta.groupBy({
      by: ['productId'],
      where: { plantId: ctx.plantId, deletedAt: null, traslado: { is: null }, despacho: { is: null } },
      _count: { _all: true },
      _sum: { netoKg: true },
    });
    return filas.map((f) => ({ productId: f.productId, unds: f._count._all, kg: Number(f._sum.netoKg ?? 0) }));
  }

  /** Hoja del producto: clientes que lo usan, inventario, producción reciente, precios y reglas de corte. */
  async ficha(ctx: AuthContext, id: string) {
    const producto = await this.prisma.product.findFirst({
      where: { id, plantId: ctx.plantId },
      select: { ...productSelect, createdAt: true },
    });
    if (!producto) throw new NotFoundException('Producto no encontrado.');
    const etiquetas = { productId: id, plantId: ctx.plantId, deletedAt: null };
    const hace30 = new Date(Date.now() - 30 * 86_400_000);
    const [clientes, disponibles, ultimos30, total, ultima, precios, reglas] = await Promise.all([
      this.prisma.clienteProducto.findMany({
        where: { productId: id },
        select: {
          tipo: true,
          refPluSku: true,
          refrigeradoDias: true,
          congeladoDias: true,
          piezasPorCanal: true,
          undsPorCaja: true,
          cliente: { select: { id: true, concepto: true, nit: true } },
        },
        orderBy: { cliente: { concepto: 'asc' } },
      }),
      this.prisma.rotuladoEtiqueta.aggregate({
        where: { ...etiquetas, traslado: { is: null }, despacho: { is: null } },
        _count: { _all: true },
        _sum: { netoKg: true },
      }),
      this.prisma.rotuladoEtiqueta.aggregate({
        where: { ...etiquetas, createdAt: { gte: hace30 } },
        _count: { _all: true },
        _sum: { netoKg: true },
      }),
      this.prisma.rotuladoEtiqueta.count({ where: etiquetas }),
      this.prisma.rotuladoEtiqueta.findFirst({
        where: etiquetas,
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      this.prisma.precioListaItem.findMany({
        where: { productId: id, lista: { plantId: ctx.plantId } },
        select: {
          precioKg: true,
          lista: { select: { nombre: true, vigenteDesde: true, cliente: { select: { concepto: true } } } },
        },
        orderBy: { lista: { vigenteDesde: 'desc' } },
        take: 20,
      }),
      this.prisma.reglaCorte.findMany({
        where: { productId: id, plantId: ctx.plantId },
        select: { retoma: true, piking: true, congelacion: true, kgCongelados: true, cliente: { select: { concepto: true } } },
      }),
    ]);
    return {
      producto: { ...producto, createdAt: producto.createdAt.toISOString() },
      clientes: clientes.map((c) => ({
        clienteId: c.cliente.id,
        cliente: c.cliente.concepto,
        nit: c.cliente.nit,
        tipo: c.tipo,
        refPluSku: c.refPluSku,
        refrigeradoDias: c.refrigeradoDias,
        congeladoDias: c.congeladoDias,
        piezasPorCanal: c.piezasPorCanal,
        undsPorCaja: c.undsPorCaja,
      })),
      inventario: { unds: disponibles._count._all, kg: Number(disponibles._sum.netoKg ?? 0) },
      produccion30: { unds: ultimos30._count._all, kg: Number(ultimos30._sum.netoKg ?? 0) },
      etiquetasTotal: total,
      ultimaEtiqueta: ultima?.createdAt.toISOString() ?? null,
      precios: precios.map((p) => ({
        lista: p.lista.nombre,
        cliente: p.lista.cliente?.concepto ?? null,
        vigenteDesde: p.lista.vigenteDesde.toISOString().slice(0, 10),
        precioKg: Number(p.precioKg),
      })),
      reglas: reglas.map((r) => ({
        cliente: r.cliente?.concepto ?? null,
        retoma: r.retoma,
        piking: r.piking,
        congelacion: r.congelacion,
        kgCongelados: r.kgCongelados == null ? null : Number(r.kgCongelados),
      })),
    };
  }

  private async siguienteCodigo(
    db: Pick<PrismaService, '$queryRaw'>,
    plantId: string,
  ) {
    const [r] = await db.$queryRaw<{ max: string | null }[]>`
      SELECT MAX(codigo::bigint)::text AS max FROM product
      WHERE plant_id = ${plantId}::uuid AND codigo ~ '^[0-9]+$'`;
    return String(Number(r?.max ?? 0) + 1);
  }

  async create(ctx: AuthContext, dto: CreateProductDto) {
    return this.prisma.$transaction(async (tx) => {
      // Serializa el consecutivo de códigos por planta.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${ctx.plantId}:product-codigo`}))`;
      const codigo = await this.siguienteCodigo(tx, ctx.plantId);
      return tx.product.create({
        data: {
          plantId: ctx.plantId,
          codigo,
          nombre: dto.nombre,
          categoria: dto.categoria || null,
        },
        select: productSelect,
      });
    });
  }

  async update(ctx: AuthContext, id: string, dto: UpdateProductDto) {
    const existe = await this.prisma.product.findFirst({
      where: { id, plantId: ctx.plantId },
      select: { id: true },
    });
    if (!existe) throw new NotFoundException('Producto no encontrado.');
    return this.prisma.product.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.categoria !== undefined && { categoria: dto.categoria || null }),
      },
      select: productSelect,
    });
  }
}
