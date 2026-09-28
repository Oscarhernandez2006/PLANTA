import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthContext } from '../../common/auth/auth-context';
import { ActualizarConservacionDto } from './dto/actualizar-conservacion.dto';
import { AsignarProductoDto } from './dto/asignar-producto.dto';

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
    return clientes.map((c) => ({
      id: c.id,
      concepto: c.concepto,
      nit: c.nit,
      productos: c._count.productos,
    }));
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
      select: { id: true },
    });
    if (!product) throw new NotFoundException('Producto no encontrado.');
    try {
      await this.prisma.clienteProducto.create({
        data: {
          clienteId,
          productId,
          ...conservacion,
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
