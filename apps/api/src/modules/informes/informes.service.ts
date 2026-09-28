import { Injectable, NotFoundException } from '@nestjs/common';
import { CanalPiezaTipo } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthContext } from '../../common/auth/auth-context';
import { plantDateOnly } from '../../common/plant-date';

/** Días hacia atrás que abarca el informe desde la fecha elegida. */
const DIAS_INFORME = 60;

/** Producto del catálogo que corresponde a cada pieza de canal (izquierda = con cola, derecha = sin cola). */
const PRODUCTO_POR_PIEZA: Record<CanalPiezaTipo, { codigo: string; nombre: string }> = {
  canal: { codigo: '10001', nombre: 'CANAL COMPLETA DE RES' },
  cizq: { codigo: '10002', nombre: 'MEDIA CANAL CON COLA DE RES' },
  cder: { codigo: '10003', nombre: 'MEDIA CANAL SR DE RES' },
};

const ORDEN_PIEZA: Record<CanalPiezaTipo, number> = { canal: 0, cizq: 1, cder: 2 };

/** Destinos distintos registrados en las piezas de una orden, o null si no hay. */
function destinos(piezas: { destino: string | null }[]) {
  const unicos = [...new Set(piezas.map((p) => p.destino?.trim()).filter(Boolean))];
  return unicos.length ? unicos.join(', ') : null;
}

@Injectable()
export class InformesService {
  constructor(private readonly prisma: PrismaService) {}

  /** 01.7 CANAL/CALIENTE: órdenes con canales pesadas, de la más reciente a la más antigua. */
  async canalCaliente(ctx: AuthContext, hasta?: string) {
    const fin = plantDateOnly(hasta);
    const inicio = new Date(fin);
    inicio.setUTCDate(inicio.getUTCDate() - DIAS_INFORME);

    const ordenes = await this.prisma.ordenBeneficio.findMany({
      where: {
        plantId: ctx.plantId,
        deletedAt: null,
        date: { gte: inicio, lte: fin },
        eventos: { some: { canalPiezas: { some: {} } } },
      },
      select: {
        id: true,
        reference: true,
        cliente: true,
        date: true,
        status: true,
        eventos: { select: { canalPiezas: { select: { destino: true } } } },
      },
      orderBy: [{ date: 'desc' }, { reference: 'desc' }],
    });
    return ordenes.map(({ eventos, ...o }) => ({
      ...o,
      date: o.date.toISOString().slice(0, 10),
      destino: destinos(eventos.flatMap((e) => e.canalPiezas)),
    }));
  }

  /** Detalle de una orden: cada pieza de canal pesada con su producto y peso. */
  async canalCalienteDetalle(ctx: AuthContext, ordenId: string) {
    const orden = await this.prisma.ordenBeneficio.findFirst({
      where: { id: ordenId, plantId: ctx.plantId, deletedAt: null },
      select: {
        id: true,
        reference: true,
        cliente: true,
        date: true,
        eventos: {
          select: {
            sequence: true,
            canalTipo: true,
            canalAnimalTipo: true,
            canalPiezas: {
              select: {
                id: true,
                pieza: true,
                turno: true,
                pesoKg: true,
                destino: true,
                observaciones: true,
              },
            },
          },
        },
      },
    });
    if (!orden) throw new NotFoundException('Orden no encontrada.');

    // Nombres vigentes del catálogo (si existen); si no, los por defecto.
    const productos = await this.prisma.product.findMany({
      where: {
        plantId: ctx.plantId,
        codigo: { in: Object.values(PRODUCTO_POR_PIEZA).map((p) => p.codigo) },
      },
      select: { codigo: true, nombre: true },
    });
    const nombrePorCodigo = new Map(productos.map((p) => [p.codigo, p.nombre]));
    const cliente = await this.prisma.cliente.findUnique({
      where: { concepto: orden.cliente },
      select: { nit: true, direccion: true, ciudad: true },
    });

    const piezas = orden.eventos
      .flatMap((e) =>
        e.canalPiezas.map((p) => {
          const prod = PRODUCTO_POR_PIEZA[p.pieza];
          return {
            piezaId: p.id,
            sequence: e.sequence,
            turno: p.turno,
            pieza: p.pieza,
            canalTipo: e.canalTipo,
            canalAnimalTipo: e.canalAnimalTipo,
            observaciones: p.observaciones,
            codigo: prod.codigo,
            producto: nombrePorCodigo.get(prod.codigo) ?? prod.nombre,
            pesoKg: Number(p.pesoKg),
          };
        }),
      )
      .sort(
        (a, b) =>
          (a.turno ?? a.sequence) - (b.turno ?? b.sequence) ||
          ORDEN_PIEZA[a.pieza] - ORDEN_PIEZA[b.pieza],
      );

    return {
      id: orden.id,
      reference: orden.reference,
      cliente: orden.cliente,
      clienteNit: cliente?.nit ?? null,
      clienteDireccion: cliente?.direccion ?? null,
      clienteCiudad: cliente?.ciudad ?? null,
      destino: destinos(orden.eventos.flatMap((e) => e.canalPiezas)),
      date: orden.date.toISOString().slice(0, 10),
      piezas,
    };
  }
}
