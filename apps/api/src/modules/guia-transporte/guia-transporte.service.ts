import { Injectable, NotFoundException } from '@nestjs/common';
import { DispatchOrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthContext } from '../../common/auth/auth-context';
import { plantDateOnly } from '../../common/plant-date';
import {
  CreateGuiaTransporteDto,
  QueryGuiasTransporteDto,
  UpdateGuiaTransporteDto,
} from './guia-transporte.dto';

type Db = Prisma.TransactionClient | PrismaService;

const despachoGuiaSelect = {
  id: true,
  dcNumber: true,
  tipo: true,
  status: true,
  cliente: { select: { concepto: true } },
  puntoEnvio: { select: { razonSocial: true } },
} as const;

export const guiaSelect = {
  id: true,
  numero: true,
  fecha: true,
  tipoVehiculo: true,
  placa: true,
  conductor: true,
  cedula: true,
  observacion: true,
  createdAt: true,
  despachos: {
    where: { deletedAt: null },
    orderBy: { dcNumber: 'asc' },
    select: despachoGuiaSelect,
  },
  remisiones: {
    where: { canalDispatchOrder: { deletedAt: null } },
    orderBy: { remisionNumero: 'asc' },
    select: { id: true, tiendaCodigo: true, tiendaNombre: true, canalDispatchOrder: { select: despachoGuiaSelect } },
  },
} as const;

type GuiaRow = Prisma.GuiaTransporteGetPayload<{ select: typeof guiaSelect }>;

const guiaDto = ({ remisiones, ...g }: GuiaRow) => {
  // Órdenes de la guía: las de remisión única y las que tienen tiendas en este camión.
  const despachos = new Map(
    g.despachos.map((d) => [
      d.id,
      { id: d.id, dcNumber: d.dcNumber, tipo: d.tipo, status: d.status, cliente: d.cliente.concepto, puntoEnvio: d.puntoEnvio?.razonSocial ?? null, tiendas: [] as { pickingId: string; nombre: string }[] },
    ]),
  );
  for (const r of remisiones) {
    const d = r.canalDispatchOrder!;
    const fila =
      despachos.get(d.id) ??
      { id: d.id, dcNumber: d.dcNumber, tipo: d.tipo, status: d.status, cliente: d.cliente.concepto, puntoEnvio: null, tiendas: [] };
    fila.tiendas.push({ pickingId: r.id, nombre: [r.tiendaCodigo, r.tiendaNombre].filter(Boolean).join(' - ') || 'Pre-orden' });
    despachos.set(d.id, fila);
  }
  return {
    ...g,
    fecha: g.fecha.toISOString().slice(0, 10),
    despachos: [...despachos.values()].sort((a, b) => a.dcNumber - b.dcNumber),
  };
};

/** Inicio del día (00:00 Colombia) en UTC. */
const inicioDia = (fecha: string) => new Date(`${fecha}T00:00:00-05:00`);
const diaSiguiente = (fecha: string) => new Date(inicioDia(fecha).getTime() + 86_400_000);

/** Crea la guía con el siguiente consecutivo GM de la planta (dentro de la transacción). */
export async function crearGuia(tx: Prisma.TransactionClient, ctx: AuthContext, dto: CreateGuiaTransporteDto) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${ctx.plantId}:guia-transporte`}))`;
  const agg = await tx.guiaTransporte.aggregate({
    _max: { numero: true },
    where: { plantId: ctx.plantId },
  });
  return tx.guiaTransporte.create({
    data: {
      plantId: ctx.plantId,
      numero: (agg._max.numero ?? 0) + 1,
      fecha: plantDateOnly(dto.fecha?.slice(0, 10)),
      tipoVehiculo: dto.tipoVehiculo,
      placa: dto.placa.replace(/\s+/g, ''),
      conductor: dto.conductor,
      cedula: dto.cedula || null,
      observacion: dto.observacion || null,
      createdById: ctx.userId,
    },
    select: { id: true, numero: true },
  });
}

@Injectable()
export class GuiaTransporteService {
  constructor(private readonly prisma: PrismaService) {}

  async nextNumber(ctx: AuthContext) {
    const agg = await this.prisma.guiaTransporte.aggregate({
      _max: { numero: true },
      where: { plantId: ctx.plantId },
    });
    return { next: (agg._max.numero ?? 0) + 1 };
  }

  async list(ctx: AuthContext, q: QueryGuiasTransporteDto) {
    const buscar = q.buscar?.trim().toUpperCase();
    const numero = buscar?.match(/^(?:GM)?(\d+)$/)?.[1];
    const where: Prisma.GuiaTransporteWhereInput = {
      plantId: ctx.plantId,
      deletedAt: null,
      ...(q.desde || q.hasta
        ? {
            fecha: {
              ...(q.desde ? { gte: plantDateOnly(q.desde) } : {}),
              ...(q.hasta ? { lte: plantDateOnly(q.hasta) } : {}),
            },
          }
        : {}),
      ...(buscar
        ? {
            OR: [
              ...(numero ? [{ numero: Number(numero) }] : []),
              { placa: { contains: buscar.replace(/\s+/g, ''), mode: 'insensitive' as const } },
              { conductor: { contains: buscar, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.guiaTransporte.findMany({
      where,
      orderBy: { numero: 'desc' },
      take: 200,
      select: guiaSelect,
    });
    return rows.map(guiaDto);
  }

  async create(ctx: AuthContext, dto: CreateGuiaTransporteDto) {
    const { id } = await this.prisma.$transaction((tx) => crearGuia(tx, ctx, dto));
    return this.uno(ctx, id);
  }

  async update(ctx: AuthContext, id: string, dto: UpdateGuiaTransporteDto) {
    await this.uno(ctx, id);
    await this.prisma.guiaTransporte.update({
      where: { id },
      data: {
        ...(dto.fecha ? { fecha: plantDateOnly(dto.fecha.slice(0, 10)) } : {}),
        ...(dto.tipoVehiculo !== undefined ? { tipoVehiculo: dto.tipoVehiculo } : {}),
        ...(dto.placa !== undefined ? { placa: dto.placa.replace(/\s+/g, '') } : {}),
        ...(dto.conductor !== undefined ? { conductor: dto.conductor } : {}),
        ...(dto.cedula !== undefined ? { cedula: dto.cedula || null } : {}),
        ...(dto.observacion !== undefined ? { observacion: dto.observacion || null } : {}),
      },
    });
    return this.uno(ctx, id);
  }

  async uno(ctx: AuthContext, id: string, db: Db = this.prisma) {
    const g = await db.guiaTransporte.findFirst({
      where: { id, plantId: ctx.plantId, deletedAt: null },
      select: guiaSelect,
    });
    if (!g) throw new NotFoundException('Guía de transporte no encontrada.');
    return guiaDto(g);
  }

  /** Órdenes de despacho de canales cerradas en el periodo (Informes de despacho). */
  async despachosCerrados(ctx: AuthContext, q: QueryGuiasTransporteDto) {
    const rango = {
      ...(q.desde ? { gte: inicioDia(q.desde) } : {}),
      ...(q.hasta ? { lt: diaSiguiente(q.hasta) } : {}),
    };
    const buscar = q.buscar?.trim();
    const numero = buscar?.toUpperCase().match(/^(?:DC|GM)?(\d+)$/)?.[1];
    const rows = await this.prisma.canalDispatchOrder.findMany({
      where: {
        plantId: ctx.plantId,
        deletedAt: null,
        status: DispatchOrderStatus.facturado,
        OR: [{ cerradaAt: rango }, { cerradaAt: null, updatedAt: rango }],
        ...(buscar
          ? {
              AND: [
                {
                  OR: [
                    ...(numero
                      ? [
                          { dcNumber: Number(numero) },
                          { guiaTransporte: { numero: Number(numero) } },
                          { pickings: { some: { guiaTransporte: { numero: Number(numero) } } } },
                        ]
                      : []),
                    { cliente: { concepto: { contains: buscar, mode: 'insensitive' as const } } },
                    { puntoEnvio: { razonSocial: { contains: buscar, mode: 'insensitive' as const } } },
                    { guiaTransporte: { placa: { contains: buscar, mode: 'insensitive' as const } } },
                    { pickings: { some: { guiaTransporte: { placa: { contains: buscar, mode: 'insensitive' as const } } } } },
                    { pickings: { some: { tiendaNombre: { contains: buscar, mode: 'insensitive' as const } } } },
                  ],
                },
              ],
            }
          : {}),
      },
      orderBy: { dcNumber: 'desc' },
      take: 500,
      select: {
        id: true,
        dcNumber: true,
        tipo: true,
        processDate: true,
        cerradaAt: true,
        updatedAt: true,
        cliente: { select: { concepto: true, nit: true } },
        puntoEnvio: { select: { razonSocial: true, municipio: true } },
        guiaTransporte: { select: { numero: true, placa: true, conductor: true } },
        pickings: {
          where: { guiaTransporteId: { not: null } },
          orderBy: { remisionNumero: 'asc' },
          select: { guiaTransporte: { select: { id: true, numero: true, placa: true, conductor: true } } },
        },
      },
    });
    return rows.map((r) => {
      // Remisiones por tienda: guías distintas de sus pre-órdenes (en orden de remisión).
      const guiasTiendas = [
        ...new Map(r.pickings.map((p) => [p.guiaTransporte!.id, p.guiaTransporte!])).values(),
      ].map(({ id: _id, ...g }) => g);
      return {
        id: r.id,
        dcNumber: r.dcNumber,
        tipo: r.tipo,
        processDate: r.processDate.toISOString().slice(0, 10),
        cerradaAt: (r.cerradaAt ?? r.updatedAt).toISOString(),
        cliente: r.cliente.concepto,
        clienteNit: r.cliente.nit,
        puntoEnvio: r.puntoEnvio?.razonSocial ?? null,
        municipio: r.puntoEnvio?.municipio ?? null,
        guia: r.guiaTransporte ?? guiasTiendas[0] ?? null,
        guias: r.pickings.length ? guiasTiendas : r.guiaTransporte ? [r.guiaTransporte] : [],
        remisiones: r.pickings.length || 1,
      };
    });
  }
}
