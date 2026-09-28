import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ClienteContactoDto,
  CreateClienteDto,
  UpdateClienteDto,
} from './dto/create-cliente.dto';

const clienteSelect = {
  id: true,
  code: true,
  concepto: true,
  nit: true,
} as const;

const clienteCompletoSelect = {
  ...clienteSelect,
  direccion: true,
  telefono: true,
  ciudad: true,
  contacto: true,
  correo: true,
  celular: true,
  active: true,
} as const;

const CAMPOS_CONTACTO = [
  'nit',
  'direccion',
  'telefono',
  'ciudad',
  'contacto',
  'correo',
  'celular',
] as const;

/** Solo los campos enviados; un texto vacío se guarda como null. */
function datosContacto(dto: ClienteContactoDto) {
  const data: Partial<Record<(typeof CAMPOS_CONTACTO)[number], string | null>> = {};
  for (const k of CAMPOS_CONTACTO) {
    if (dto[k] !== undefined) data[k] = dto[k] || null;
  }
  return data;
}

@Injectable()
export class ClienteService {
  constructor(private readonly prisma: PrismaService) {}

  /** Próximo código (solo previsualización; el definitivo se asigna al guardar). */
  async nextCode() {
    const agg = await this.prisma.cliente.aggregate({ _max: { code: true } });
    return { next: (agg._max.code ?? 0) + 1 };
  }

  findAll(search?: string, todos = false) {
    const q = search?.trim();
    return this.prisma.cliente.findMany({
      where: {
        ...(todos ? {} : { active: true }),
        ...(q
          ? todos
            ? {
                OR: [
                  { concepto: { contains: q, mode: 'insensitive' } },
                  { nit: { contains: q, mode: 'insensitive' } },
                ],
              }
            : { concepto: { contains: q, mode: 'insensitive' } }
          : {}),
      },
      select: todos ? clienteCompletoSelect : clienteSelect,
      orderBy: { concepto: 'asc' },
      take: todos ? 5000 : 500,
    });
  }

  /** Alta de cliente con código autogenerado. Idempotente por concepto salvo `estricto`. */
  async create(dto: CreateClienteDto) {
    const concepto = dto.concepto.trim().toUpperCase();

    const existing = await this.prisma.cliente.findUnique({
      where: { concepto },
      select: clienteCompletoSelect,
    });
    if (existing) {
      if (dto.estricto) {
        throw new ConflictException(`Ya existe el cliente ${concepto}.`);
      }
      return existing;
    }

    return this.prisma.cliente.create({
      // Cada cliente nace con su bodega (con su mismo nombre).
      data: { concepto, ...datosContacto(dto), bodegas: { create: { nombre: concepto } } },
      select: clienteCompletoSelect,
    });
  }

  /**
   * Actualiza el cliente. Si cambia el nombre, se actualiza también en los
   * registros que lo guardan como texto, para no perder su historial.
   */
  async update(id: string, dto: UpdateClienteDto) {
    const actual = await this.prisma.cliente.findUnique({
      where: { id },
      select: { concepto: true },
    });
    if (!actual) throw new NotFoundException('Cliente no encontrado.');
    const concepto = dto.concepto?.trim().toUpperCase();
    const renombra = !!concepto && concepto !== actual.concepto;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const actualizado = await tx.cliente.update({
          where: { id },
          data: {
            ...datosContacto(dto),
            ...(concepto && { concepto }),
            ...(dto.active !== undefined && { active: dto.active }),
          },
          select: clienteCompletoSelect,
        });
        if (renombra) {
          const where = { cliente: actual.concepto };
          const data = { cliente: concepto };
          await tx.pesoCamion.updateMany({ where, data });
          await tx.pesoEnPie.updateMany({ where, data });
          await tx.ordenBeneficio.updateMany({ where, data });
          await tx.bodega.updateMany({
            where: { clienteId: id, nombre: actual.concepto },
            data: { nombre: concepto },
          });
        }
        return actualizado;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`Ya existe el cliente ${concepto}.`);
      }
      throw e;
    }
  }
}
