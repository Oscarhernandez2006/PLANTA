import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateConductorDto } from './dto/create-conductor.dto';

const conductorSelect = {
  id: true,
  code: true,
  concepto: true,
} as const;

@Injectable()
export class ConductorService {
  constructor(private readonly prisma: PrismaService) {}

  /** Próximo código (solo previsualización; el definitivo se asigna al guardar). */
  async nextCode() {
    const agg = await this.prisma.conductor.aggregate({ _max: { code: true } });
    return { next: (agg._max.code ?? 0) + 1 };
  }

  findAll(search?: string) {
    return this.prisma.conductor.findMany({
      where: {
        active: true,
        ...(search
          ? { concepto: { contains: search, mode: 'insensitive' } }
          : {}),
      },
      select: conductorSelect,
      orderBy: { concepto: 'asc' },
      take: 50,
    });
  }

  /** Alta de conductor con código autogenerado. Idempotente por concepto. */
  async create(dto: CreateConductorDto) {
    const concepto = dto.concepto.trim().toUpperCase();

    const existing = await this.prisma.conductor.findUnique({
      where: { concepto },
      select: conductorSelect,
    });
    if (existing) return existing;

    return this.prisma.conductor.create({
      data: { concepto },
      select: conductorSelect,
    });
  }
}
