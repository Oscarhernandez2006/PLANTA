import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePuntoEnvioDto, UpdatePuntoEnvioDto } from './dto/punto-envio.dto';

export const puntoEnvioSelect = {
  id: true,
  razonSocial: true,
  nit: true,
  telefono: true,
  direccion: true,
  municipio: true,
  departamento: true,
  active: true,
} as const;

const CAMPOS = ['nit', 'telefono', 'direccion', 'municipio', 'departamento'] as const;

function duplicado(err: unknown, razonSocial?: string) {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') return null;
  return new ConflictException(`Ya existe el punto de envío ${razonSocial ?? ''} para este cliente.`);
}

/** Puntos de envío del cliente: los clientes de mi cliente, a donde se despacha. */
@Injectable()
export class PuntoEnvioService {
  constructor(private readonly prisma: PrismaService) {}

  async list(clienteId: string) {
    const c = await this.prisma.cliente.findUnique({ where: { id: clienteId }, select: { id: true } });
    if (!c) throw new NotFoundException('Cliente no encontrado.');
    return this.prisma.puntoEnvio.findMany({
      where: { clienteId },
      orderBy: { razonSocial: 'asc' },
      select: puntoEnvioSelect,
    });
  }

  async create(clienteId: string, dto: CreatePuntoEnvioDto) {
    const c = await this.prisma.cliente.findUnique({ where: { id: clienteId }, select: { id: true } });
    if (!c) throw new NotFoundException('Cliente no encontrado.');
    try {
      return await this.prisma.puntoEnvio.create({
        data: {
          clienteId,
          razonSocial: dto.razonSocial,
          ...Object.fromEntries(CAMPOS.map((k) => [k, dto[k] || null])),
        },
        select: puntoEnvioSelect,
      });
    } catch (err) {
      throw duplicado(err, dto.razonSocial) ?? err;
    }
  }

  async update(id: string, dto: UpdatePuntoEnvioDto) {
    const p = await this.prisma.puntoEnvio.findUnique({ where: { id }, select: { id: true } });
    if (!p) throw new NotFoundException('Punto de envío no encontrado.');
    try {
      return await this.prisma.puntoEnvio.update({
        where: { id },
        data: {
          ...(dto.razonSocial !== undefined ? { razonSocial: dto.razonSocial } : {}),
          ...Object.fromEntries(
            CAMPOS.filter((k) => dto[k] !== undefined).map((k) => [k, dto[k] || null]),
          ),
          ...(dto.active !== undefined ? { active: dto.active } : {}),
        },
        select: puntoEnvioSelect,
      });
    } catch (err) {
      throw duplicado(err, dto.razonSocial) ?? err;
    }
  }
}
