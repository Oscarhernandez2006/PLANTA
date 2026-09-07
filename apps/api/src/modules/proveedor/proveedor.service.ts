import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProveedorDto } from './dto/create-proveedor.dto';

const proveedorSelect = {
  id: true,
  code: true,
  concepto: true,
} as const;

@Injectable()
export class ProveedorService {
  constructor(private readonly prisma: PrismaService) {}

  /** Próximo código (solo previsualización; el definitivo se asigna al guardar). */
  async nextCode() {
    const agg = await this.prisma.proveedor.aggregate({ _max: { code: true } });
    return { next: (agg._max.code ?? 0) + 1 };
  }

  findAll(search?: string) {
    return this.prisma.proveedor.findMany({
      where: {
        active: true,
        ...(search
          ? { concepto: { contains: search, mode: 'insensitive' } }
          : {}),
      },
      select: proveedorSelect,
      orderBy: { concepto: 'asc' },
      take: 50,
    });
  }

  /** Alta de proveedor con código autogenerado. Idempotente por concepto. */
  async create(dto: CreateProveedorDto) {
    const concepto = dto.concepto.trim().toUpperCase();

    const existing = await this.prisma.proveedor.findUnique({
      where: { concepto },
      select: proveedorSelect,
    });
    if (existing) return existing;

    return this.prisma.proveedor.create({
      data: { concepto },
      select: proveedorSelect,
    });
  }
}
