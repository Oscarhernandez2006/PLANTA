import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTiendaDto, UpdateTiendaDto } from './dto/tienda.dto';

const tiendaSelect = {
  id: true,
  codigo: true,
  nombre: true,
  direccion: true,
  ciudad: true,
  active: true,
} as const;

/** Mensaje según el índice único que falló (código o nombre). */
function duplicado(err: unknown, dto: { nombre?: string }) {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') return null;
  const campos = String((err.meta as { target?: unknown } | undefined)?.target ?? '');
  return new ConflictException(
    campos.includes('codigo')
      ? 'Otro usuario registró una tienda al mismo tiempo; intenta de nuevo.'
      : `Ya existe la tienda ${dto.nombre} para este cliente.`,
  );
}

/** Siguiente consecutivo de 2 dígitos (01, 02, …) según los códigos numéricos existentes. */
function siguienteCodigo(codigos: string[]) {
  const max = codigos.reduce((m, c) => (/^\d+$/.test(c) ? Math.max(m, Number(c)) : m), 0);
  return String(max + 1).padStart(2, '0');
}

@Injectable()
export class TiendaService {
  constructor(private readonly prisma: PrismaService) {}

  private async cliente(clienteId: string) {
    const c = await this.prisma.cliente.findUnique({
      where: { id: clienteId },
      select: { id: true },
    });
    if (!c) throw new NotFoundException('Cliente no encontrado.');
  }

  async list(clienteId: string) {
    await this.cliente(clienteId);
    return this.prisma.clienteTienda.findMany({
      where: { clienteId },
      orderBy: { codigo: 'asc' },
      select: tiendaSelect,
    });
  }

  async nextCode(clienteId: string) {
    const rows = await this.prisma.clienteTienda.findMany({
      where: { clienteId },
      select: { codigo: true },
    });
    return { next: siguienteCodigo(rows.map((r) => r.codigo)) };
  }

  async create(clienteId: string, dto: CreateTiendaDto) {
    await this.cliente(clienteId);
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Serializa el consecutivo por cliente.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${clienteId}:tienda`}))`;
        const rows = await tx.clienteTienda.findMany({
          where: { clienteId },
          select: { codigo: true },
        });
        return tx.clienteTienda.create({
          data: {
            clienteId,
            codigo: siguienteCodigo(rows.map((r) => r.codigo)),
            nombre: dto.nombre,
            direccion: dto.direccion || null,
            ciudad: dto.ciudad || null,
          },
          select: tiendaSelect,
        });
      });
    } catch (err) {
      throw duplicado(err, dto) ?? err;
    }
  }

  async update(tiendaId: string, dto: UpdateTiendaDto) {
    const tienda = await this.prisma.clienteTienda.findUnique({
      where: { id: tiendaId },
      select: { id: true },
    });
    if (!tienda) throw new NotFoundException('Tienda no encontrada.');
    try {
      return await this.prisma.clienteTienda.update({
        where: { id: tiendaId },
        data: {
          ...(dto.nombre !== undefined ? { nombre: dto.nombre } : {}),
          ...(dto.direccion !== undefined ? { direccion: dto.direccion || null } : {}),
          ...(dto.ciudad !== undefined ? { ciudad: dto.ciudad || null } : {}),
          ...(dto.active !== undefined ? { active: dto.active } : {}),
        },
        select: tiendaSelect,
      });
    } catch (err) {
      throw duplicado(err, dto) ?? err;
    }
  }
}
