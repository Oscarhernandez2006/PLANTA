import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProcedenciaDto } from './dto/create-procedencia.dto';

const procedenciaSelect = {
  id: true,
  code: true,
  nit: true,
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
          ? {
              OR: [
                { concepto: { contains: search, mode: 'insensitive' } },
                { rspp: { contains: search, mode: 'insensitive' } },
                { nit: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: procedenciaSelect,
      orderBy: { concepto: 'asc' },
      take: 500,
    });
  }

  /** Alta de procedencia (se identifica por su RSPP). Idempotente por concepto: si ya existe, actualiza RSPP/NIT enviados. */
  async create(dto: CreateProcedenciaDto) {
    const concepto = dto.concepto.trim().toUpperCase();
    const rspp = dto.rspp?.trim().toUpperCase() || null;
    const nit = dto.nit?.trim() || null;

    const existing = await this.prisma.procedencia.findUnique({
      where: { concepto },
      select: procedenciaSelect,
    });

    if (existing) {
      const data = {
        ...(rspp && rspp !== existing.rspp ? { rspp } : {}),
        ...(nit && nit !== existing.nit ? { nit } : {}),
      };
      if (Object.keys(data).length) {
        return this.prisma.procedencia.update({
          where: { concepto },
          data,
          select: procedenciaSelect,
        });
      }
      return existing;
    }

    return this.prisma.procedencia.create({
      data: { concepto, rspp, nit },
      select: procedenciaSelect,
    });
  }
}
