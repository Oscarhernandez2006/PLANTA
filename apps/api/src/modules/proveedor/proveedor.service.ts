import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProveedorDto } from './dto/create-proveedor.dto';

const proveedorSelect = {
  id: true,
  code: true,
  nit: true,
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
          ? {
              OR: [
                { concepto: { contains: search, mode: 'insensitive' } },
                { nit: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: proveedorSelect,
      orderBy: { concepto: 'asc' },
      take: 500,
    });
  }

  /** Alta de proveedor (se guarda con su NIT). Idempotente por concepto: si ya existe, actualiza el NIT enviado. */
  async create(dto: CreateProveedorDto) {
    const concepto = dto.concepto.trim().toUpperCase();
    const nit = dto.nit?.trim() || null;

    const existing = await this.prisma.proveedor.findUnique({
      where: { concepto },
      select: proveedorSelect,
    });
    if (existing) {
      if (nit && nit !== existing.nit) {
        return this.prisma.proveedor.update({
          where: { concepto },
          data: { nit },
          select: proveedorSelect,
        });
      }
      return existing;
    }

    return this.prisma.proveedor.create({
      data: { concepto, nit },
      select: proveedorSelect,
    });
  }
}
