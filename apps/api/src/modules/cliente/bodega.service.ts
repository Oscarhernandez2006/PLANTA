import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateBodegaDto, UpdateBodegaDto } from './dto/bodega.dto';

const bodegaSelect = {
  id: true,
  code: true,
  nombre: true,
  active: true,
} as const;

function duplicado(err: unknown, nombre?: string) {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    return new ConflictException(`Ya existe la bodega ${nombre} para este cliente.`);
  }
  return null;
}

@Injectable()
export class BodegaService {
  constructor(private readonly prisma: PrismaService) {}

  async list(clienteId: string) {
    const cliente = await this.prisma.cliente.findUnique({
      where: { id: clienteId },
      select: { id: true },
    });
    if (!cliente) throw new NotFoundException('Cliente no encontrado.');
    return this.prisma.bodega.findMany({
      where: { clienteId },
      orderBy: { code: 'asc' },
      select: bodegaSelect,
    });
  }

  async nextCode() {
    const agg = await this.prisma.bodega.aggregate({ _max: { code: true } });
    return { next: (agg._max.code ?? 0) + 1 };
  }

  async create(clienteId: string, dto: CreateBodegaDto) {
    await this.list(clienteId);
    try {
      return await this.prisma.bodega.create({
        data: { clienteId, nombre: dto.nombre },
        select: bodegaSelect,
      });
    } catch (err) {
      throw duplicado(err, dto.nombre) ?? err;
    }
  }

  async update(id: string, dto: UpdateBodegaDto) {
    const bodega = await this.prisma.bodega.findUnique({ where: { id }, select: { id: true } });
    if (!bodega) throw new NotFoundException('Bodega no encontrada.');
    try {
      return await this.prisma.bodega.update({
        where: { id },
        data: {
          ...(dto.nombre !== undefined ? { nombre: dto.nombre } : {}),
          ...(dto.active !== undefined ? { active: dto.active } : {}),
        },
        select: bodegaSelect,
      });
    } catch (err) {
      throw duplicado(err, dto.nombre) ?? err;
    }
  }
}
