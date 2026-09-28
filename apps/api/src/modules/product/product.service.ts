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
