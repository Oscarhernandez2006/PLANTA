import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';

export type DestinoRecibo =
  | {
      ok: true;
      cliente: { id: string; concepto: string; nit: string };
      bodegas: { id: string; code: number; nombre: string }[];
    }
  | {
      ok: false;
      motivo: 'sin_cliente' | 'sin_nit' | 'sin_bodega';
      mensaje: string;
      cliente: { id: string; concepto: string; nit: string | null } | null;
    };

/**
 * A qué cliente y bodega entra lo recibido. Para cerrar la orden el cliente debe existir y estar
 * activo en el maestro, tener NIT y al menos una bodega activa.
 */
export async function destinoRecibo(prisma: PrismaService, clienteId: string): Promise<DestinoRecibo> {
  const cliente = await prisma.cliente.findUnique({
    where: { id: clienteId },
    select: {
      id: true,
      concepto: true,
      nit: true,
      active: true,
      bodegas: { where: { active: true }, orderBy: { code: 'asc' }, select: { id: true, code: true, nombre: true } },
    },
  });
  if (!cliente || !cliente.active) {
    return {
      ok: false,
      motivo: 'sin_cliente',
      mensaje: 'El cliente de esta orden no existe o está inactivo en el maestro de clientes.',
      cliente: cliente && { id: cliente.id, concepto: cliente.concepto, nit: cliente.nit },
    };
  }
  const base = { id: cliente.id, concepto: cliente.concepto, nit: cliente.nit };
  if (!cliente.nit?.trim()) {
    return { ok: false, motivo: 'sin_nit', mensaje: `El cliente ${cliente.concepto} no tiene NIT registrado.`, cliente: base };
  }
  if (!cliente.bodegas.length) {
    return { ok: false, motivo: 'sin_bodega', mensaje: `El cliente ${cliente.concepto} no tiene ninguna bodega creada.`, cliente: base };
  }
  // La bodega que lleva el nombre del cliente es la de por defecto: va primero.
  const bodegas = [...cliente.bodegas].sort(
    (a, b) => Number(b.nombre === cliente.concepto) - Number(a.nombre === cliente.concepto) || a.code - b.code,
  );
  return { ok: true, cliente: { ...base, nit: cliente.nit }, bodegas };
}

/** Valida el destino al cerrar y devuelve la bodega elegida (o la de por defecto). */
export async function bodegaParaCerrar(prisma: PrismaService, clienteId: string, bodegaId?: string) {
  const d = await destinoRecibo(prisma, clienteId);
  if (!d.ok) throw new BadRequestException(`${d.mensaje} Primero debes crearlo para poder cerrar la orden de recibo.`);
  if (!bodegaId) return d.bodegas[0].id;
  if (!d.bodegas.some((b) => b.id === bodegaId)) {
    throw new BadRequestException('La bodega elegida no es del cliente o está inactiva.');
  }
  return bodegaId;
}
