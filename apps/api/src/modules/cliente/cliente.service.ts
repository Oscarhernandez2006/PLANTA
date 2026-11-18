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

  /** Por cliente: bodegas y tiendas activas, productos configurados, órdenes y último movimiento. */
  async resumen() {
    const vivas = { where: { deletedAt: null } } as const;
    const filas = await this.prisma.cliente.findMany({
      select: {
        id: true,
        _count: {
          select: {
            bodegas: { where: { active: true } },
            tiendas: { where: { active: true } },
            productos: true,
            ordenesDespacho: vivas,
            ordenesProduccion: vivas,
            ordenesTraslado: vivas,
            ordenesAcondicionamiento: vivas,
            ordenesDespachoCanales: vivas,
            recibosCanales: vivas,
            recibosPosta: vivas,
          },
        },
      },
    });
    const ultimas = await Promise.all(
      (
        [
          this.prisma.dispatchOrder,
          this.prisma.productionOrder,
          this.prisma.transferOrder,
          this.prisma.conditioningOrder,
          this.prisma.canalDispatchOrder,
          this.prisma.canalReceiptOrder,
          this.prisma.postaReceiptOrder,
        ] as unknown as {
          groupBy: (a: object) => Promise<{ clienteId: string; _max: { createdAt: Date | null } }[]>;
        }[]
      ).map((m) => m.groupBy({ by: ['clienteId'], where: { deletedAt: null }, _max: { createdAt: true } })),
    );
    const ultimo = new Map<string, Date>();
    for (const g of ultimas.flat()) {
      const d = g._max.createdAt;
      if (d && (!ultimo.has(g.clienteId) || d > ultimo.get(g.clienteId)!)) ultimo.set(g.clienteId, d);
    }
    return filas.map(({ id, _count: c }) => ({
      clienteId: id,
      bodegas: c.bodegas,
      tiendas: c.tiendas,
      productos: c.productos,
      ordenes:
        c.ordenesDespacho +
        c.ordenesProduccion +
        c.ordenesTraslado +
        c.ordenesAcondicionamiento +
        c.ordenesDespachoCanales +
        c.recibosCanales +
        c.recibosPosta,
      ultimoMovimiento: ultimo.get(id)?.toISOString() ?? null,
    }));
  }

  /** Últimas órdenes del cliente de todos los tipos, de la más reciente a la más antigua. */
  async ordenes(id: string) {
    const where = { clienteId: id, deletedAt: null };
    const base = { status: true, processDate: true, createdAt: true } as const;
    const orden = { createdAt: 'desc' } as const;
    const take = 15;
    const [od, op, ot, oc, dc, rc, rp] = await Promise.all([
      this.prisma.dispatchOrder.findMany({ where, select: { ...base, id: true, odNumber: true }, orderBy: orden, take }),
      this.prisma.productionOrder.findMany({ where, select: { ...base, id: true, opNumber: true }, orderBy: orden, take }),
      this.prisma.transferOrder.findMany({ where, select: { ...base, id: true, otNumber: true }, orderBy: orden, take }),
      this.prisma.conditioningOrder.findMany({ where, select: { ...base, id: true, ocNumber: true }, orderBy: orden, take }),
      this.prisma.canalDispatchOrder.findMany({ where, select: { ...base, id: true, dcNumber: true, tipo: true }, orderBy: orden, take }),
      this.prisma.canalReceiptOrder.findMany({ where, select: { ...base, id: true, receiptNumber: true }, orderBy: orden, take }),
      this.prisma.postaReceiptOrder.findMany({ where, select: { ...base, id: true, receiptNumber: true }, orderBy: orden, take }),
    ]);
    const fila = (
      tipo: string,
      numero: string,
      o: { id: string; status: string; processDate: Date; createdAt: Date },
      detalle?: string,
    ) => ({
      id: o.id,
      tipo,
      numero,
      detalle: detalle ?? null,
      status: o.status,
      processDate: o.processDate.toISOString().slice(0, 10),
      createdAt: o.createdAt.toISOString(),
    });
    return [
      ...od.map((o) => fila('Despacho a proceso', `OD${o.odNumber}`, o)),
      ...op.map((o) => fila('Producción', `OP${o.opNumber}`, o)),
      ...ot.map((o) => fila('Traslado', `OT${o.otNumber}`, o)),
      ...oc.map((o) => fila('Acondicionamiento', `OC${o.ocNumber}`, o)),
      ...dc.map((o) => fila('Despacho canales', `DC${o.dcNumber}`, o, o.tipo)),
      ...rc.map((o) => fila('Recibo de canales', `RC${o.receiptNumber}`, o)),
      ...rp.map((o) => fila('Recibo en posta', `RP${o.receiptNumber}`, o)),
    ]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 40);
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
            : {
                OR: [
                  { concepto: { contains: q, mode: 'insensitive' } },
                  { nit: { contains: q, mode: 'insensitive' } },
                ],
              }
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
      // Desde Peso en Camión: si se escribió el NIT, queda guardado en el cliente.
      const nit = dto.nit?.trim();
      if (nit && nit !== existing.nit) {
        return this.prisma.cliente.update({
          where: { concepto },
          data: { nit },
          select: clienteCompletoSelect,
        });
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
