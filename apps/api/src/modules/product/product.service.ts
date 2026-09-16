import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthContext } from '../../common/auth/auth-context';

const productSelect = {
  id: true,
  codigo: true,
  nombre: true,
} as const;

@Injectable()
export class ProductService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(ctx: AuthContext, search?: string) {
    return this.prisma.product.findMany({
      where: {
        plantId: ctx.plantId,
        active: true,
        ...(search
          ? { nombre: { contains: search, mode: 'insensitive' } }
          : {}),
      },
      select: productSelect,
      orderBy: { nombre: 'asc' },
      take: 200,
    });
  }
}
