import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthContext } from '../../common/auth/auth-context';

@Injectable()
export class SupplierService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(ctx: AuthContext) {
    return this.prisma.supplier.findMany({
      where: { plantId: ctx.plantId, active: true },
      select: { id: true, name: true, icaFarmCode: true },
      orderBy: { name: 'asc' },
    });
  }
}
