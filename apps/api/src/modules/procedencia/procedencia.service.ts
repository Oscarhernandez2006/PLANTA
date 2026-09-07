import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProcedenciaDto } from './dto/create-procedencia.dto';

const procedenciaSelect = {
  id: true,
  code: true,
  rspp: true,
  concepto: true,
} as const;

@Injectable()
export class ProcedenciaService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(search?: string) {
    return this.prisma.procedencia.findMany({
      where: {
        active: true,
        ...(search
          ? { concepto: { contains: search, mode: 'insensitive' } }
          : {}),
      },
      select: procedenciaSelect,
      orderBy: { concepto: 'asc' },
      take: 50,
    });
  }

  /** Alta de procedencia con código autogenerado. Idempotente por concepto. */
  async create(dto: CreateProcedenciaDto) {
    const concepto = dto.concepto.trim().toUpperCase();
    const rspp = dto.rspp?.trim().toUpperCase() || null;

    const existing = await this.prisma.procedencia.findUnique({
      where: { concepto },
      select: procedenciaSelect,
    });

    if (existing) {
      if (rspp && rspp !== existing.rspp) {
        return this.prisma.procedencia.update({
          where: { concepto },
          data: { rspp },
          select: procedenciaSelect,
        });
      }
      return existing;
    }

    return this.prisma.procedencia.create({
      data: { concepto, rspp },
      select: procedenciaSelect,
    });
  }
}
