import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthContext } from '../../common/auth/auth-context';
import { ActualizarConservacionDto } from './dto/actualizar-conservacion.dto';
import { AsignarProductoDto } from './dto/asignar-producto.dto';
import { CopiarConservacionDto } from './dto/copiar-conservacion.dto';

/** Refrigerado sin caducidad (la etiqueta vencería el mismo día) o congelado que dura menos que refrigerado. */
function alertaConservacion(p: { refrigeradoDias: number; congeladoDias: number }) {
  return p.refrigeradoDias === 0 || (p.congeladoDias > 0 && p.congeladoDias < p.refrigeradoDias);
}

function tipoPorCategoria(categoria: string | null): string {
  switch (categoria) {
    case 'PRODUCTO EN PROCESO':
      return 'EN PROCESO';
    case 'RES SUBPRODUCTOS':
      return 'SUBPRODUCTO';
    case 'RES PRODUCTOS TERMINADOS':
      return 'TERMINADO';
    default:
      return 'MATERIA PRIMA';
  }
}

@Injectable()
export class ConservacionService {
  constructor(private readonly prisma: PrismaService) {}

  /** Clientes activos con cuántos productos tienen asignados en esta planta. */
  async clientes(ctx: AuthContext) {
    const clientes = await this.prisma.cliente.findMany({
      where: { active: true },
      select: {
        id: true,
        concepto: true,
        nit: true,
        _count: {
          select: { productos: { where: { product: { plantId: ctx.plantId } } } },
        },
      },
      orderBy: { concepto: 'asc' },
    });
    const configurados = await this.prisma.clienteProducto.findMany({
      where: { product: { plantId: ctx.plantId } },
      select: { clienteId: true, refrigeradoDias: true, congeladoDias: true },
    });
    const alertas = new Map<string, number>();
    for (const p of configurados)
      if (alertaConservacion(p)) alertas.set(p.clienteId, (alertas.get(p.clienteId) ?? 0) + 1);
    return clientes.map((c) => ({
      id: c.id,
      concepto: c.concepto,
      nit: c.nit,
      productos: c._count.productos,
      alertas: alertas.get(c.id) ?? 0,
    }));
  }

  /** Copia la conservación (días, temperaturas, PLU, piezas) de un cliente a otro. */
  async copiar(ctx: AuthContext, destinoId: string, dto: CopiarConservacionDto) {
    if (destinoId === dto.origenId) throw new BadRequestException('El cliente de origen y destino son el mismo.');
    await this.clienteExiste(destinoId);
    await this.clienteExiste(dto.origenId);
    const origen = await this.prisma.clienteProducto.findMany({
      where: { clienteId: dto.origenId, product: { plantId: ctx.plantId } },
      select: {
        productId: true,
        tipo: true,
        refPluSku: true,
        refrigeradoDias: true,
        refrigeradoTemp: true,
        congeladoDias: true,
        congeladoTemp: true,
        piezasPorCanal: true,
        undsPorCaja: true,
      },
    });
    const ya = new Set(
      (
        await this.prisma.clienteProducto.findMany({
          where: { clienteId: destinoId, productId: { in: origen.map((o) => o.productId) } },
          select: { productId: true },
        })
      ).map((x) => x.productId),
    );
    const nuevos = origen.filter((o) => !ya.has(o.productId));
    const existentes = origen.filter((o) => ya.has(o.productId));
    await this.prisma.$transaction([
      this.prisma.clienteProducto.createMany({ data: nuevos.map((o) => ({ ...o, clienteId: destinoId })) }),
      ...(dto.sobrescribir
        ? existentes.map(({ productId, ...datos }) =>
            this.prisma.clienteProducto.update({
              where: { clienteId_productId: { clienteId: destinoId, productId } },
              data: datos,
            }),
          )
        : []),
    ]);
    return {
      creados: nuevos.length,
      actualizados: dto.sobrescribir ? existentes.length : 0,
      omitidos: dto.sobrescribir ? 0 : existentes.length,
    };
  }

  async productos(ctx: AuthContext, clienteId: string) {
    await this.clienteExiste(clienteId);
    const asignados = await this.prisma.clienteProducto.findMany({
      where: { clienteId, product: { plantId: ctx.plantId } },
      select: {
        tipo: true,
        refPluSku: true,
        refrigeradoDias: true,
        refrigeradoTemp: true,
        congeladoDias: true,
        congeladoTemp: true,
        piezasPorCanal: true,
        undsPorCaja: true,
        product: { select: { id: true, codigo: true, nombre: true, categoria: true, active: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return asignados.map(({ product, ...conservacion }) => ({ ...product, ...conservacion }));
  }

  async actualizar(
    ctx: AuthContext,
    clienteId: string,
    productId: string,
    dto: ActualizarConservacionDto,
  ) {
    const r = await this.prisma.clienteProducto.updateMany({
      where: { clienteId, productId, product: { plantId: ctx.plantId } },
      data: {
        ...dto,
        ...(dto.refPluSku !== undefined && { refPluSku: dto.refPluSku || null }),
      },
    });
    if (!r.count) throw new NotFoundException('El producto no está asignado a este cliente.');
    return { ok: true };
  }

  async asignar(ctx: AuthContext, clienteId: string, dto: AsignarProductoDto) {
    await this.clienteExiste(clienteId);
    const { productId, ...conservacion } = dto;
    const product = await this.prisma.product.findFirst({
      where: { id: productId, plantId: ctx.plantId },
      select: { id: true, categoria: true },
    });
    if (!product) throw new NotFoundException('Producto no encontrado.');
    try {
      await this.prisma.clienteProducto.create({
        data: {
          clienteId,
          productId,
          ...conservacion,
          // Sin tipo explícito se toma el de la categoría del producto.
          tipo: conservacion.tipo ?? tipoPorCategoria(product.categoria),
          refPluSku: conservacion.refPluSku || null,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Este cliente ya tiene conservación para ese producto.');
      }
      throw e;
    }
    return { ok: true };
  }

  async quitar(ctx: AuthContext, clienteId: string, productId: string) {
    await this.prisma.clienteProducto.deleteMany({
      where: { clienteId, productId, product: { plantId: ctx.plantId } },
    });
    return { ok: true };
  }

  private async clienteExiste(id: string) {
    const c = await this.prisma.cliente.findUnique({ where: { id }, select: { id: true } });
    if (!c) throw new NotFoundException('Cliente no encontrado.');
  }
}
