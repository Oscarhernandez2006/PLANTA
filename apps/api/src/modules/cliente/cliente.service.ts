import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateClienteDto } from './dto/create-cliente.dto';

const clienteSelect = {
  id: true,
  code: true,
  concepto: true,
} as const;

@Injectable()
export class ClienteService {
  constructor(private readonly prisma: PrismaService) {}

  /** Próximo código (solo previsualización; el definitivo se asigna al guardar). */
  async nextCode() {
    const agg = await this.prisma.cliente.aggregate({ _max: { code: true } });
    return { next: (agg._max.code ?? 0) + 1 };
  }

  findAll(search?: string) {
    return this.prisma.cliente.findMany({
      where: {
        active: true,
        ...(search
          ? { concepto: { contains: search, mode: 'insensitive' } }
          : {}),
      },
      select: clienteSelect,
      orderBy: { concepto: 'asc' },
      take: 50,
    });
  }

  /** Alta de cliente con código autogenerado. Idempotente por concepto. */
  async create(dto: CreateClienteDto) {
    const concepto = dto.concepto.trim().toUpperCase();

    const existing = await this.prisma.cliente.findUnique({
      where: { concepto },
      select: clienteSelect,
    });
    if (existing) return existing;

    return this.prisma.cliente.create({
      data: { concepto },
      select: clienteSelect,
    });
  }
}
