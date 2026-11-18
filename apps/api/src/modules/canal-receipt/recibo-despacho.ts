import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DispatchOrderStatus, Prisma } from '@prisma/client';
import type { AuthContext } from '../../common/auth/auth-context';

type Db = Prisma.TransactionClient;

/** Rótulo de Recibo de Canales: `RC{orden}-{pieza}` (RC1-01). */
export function parseReciboCanal(barcode: string) {
  const m = barcode.trim().toUpperCase().match(/^RC(\d+)-(\d+)$/);
  return m ? { receiptNumber: Number(m[1]), codigo: Number(m[2]) } : null;
}

/** Rótulo de Recibo en Posta: `RP{orden}-{registro}` (RP1-01). */
export function parseReciboPosta(barcode: string) {
  const m = barcode.trim().toUpperCase().match(/^RP(\d+)-(\d+)$/);
  return m ? { receiptNumber: Number(m[1]), codigo: Number(m[2]) } : null;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const piezaRC = (orden: number, codigo: number) => `RC${orden}-${pad(codigo)}`;
export const piezaRP = (orden: number, codigo: number) => `RP${orden}-${pad(codigo)}`;

export const canalRecibidaSelect = {
  id: true,
  codigo: true,
  cava: true,
  pesoKg: true,
  guia: true,
  lote: true,
  identificacion: true,
  despachoKg: true,
  despachadoAt: true,
  createdAt: true,
  receiptOrder: {
    select: { receiptNumber: true, processDate: true, cliente: { select: { concepto: true } } },
  },
} as const;

type CanalRecibida = Prisma.CanalReceiptItemGetPayload<{ select: typeof canalRecibidaSelect }>;

/** Misma forma que las filas de canales de OD/DC (`itemRow`), marcada como recibida. */
export function canalRecibidaRow(i: CanalRecibida) {
  const o = i.receiptOrder;
  return {
    itemId: i.id,
    piezaId: i.id,
    barcode: piezaRC(o.receiptNumber, i.codigo),
    reference: o.receiptNumber,
    cliente: o.cliente.concepto,
    date: o.processDate.toISOString().slice(0, 10),
    // Las pantallas de despacho muestran este campo como tipo: identifica la canal de tercero.
    canalAnimalTipo: 'RECIBIDA',
    canalTipo: null,
    pieza: 'canal' as const,
    destino: null,
    observaciones: [i.guia && `GUÍA ${i.guia}`, i.lote && `LOTE ${i.lote}`, i.identificacion && `IDENT. ${i.identificacion}`]
      .filter(Boolean)
      .join(' · ') || null,
    sequence: i.codigo,
    turno: null,
    cavaOrigen: `CAVA ${i.cava}`,
    pesoKg: Number(i.pesoKg),
    despachoKg: i.despachoKg === null ? null : Number(i.despachoKg),
    despachadoAt: (i.despachadoAt ?? i.createdAt).toISOString(),
    recibida: true as const,
  };
}

/**
 * Canal recibida lista para salir: su recibo está cerrado (ya entró a la bodega del cliente),
 * es del mismo cliente de la orden de despacho y no ha salido en otra orden.
 */
export async function canalRecibidaDisponible(db: Db, ctx: AuthContext, barcode: string, clienteId: string) {
  const ref = parseReciboCanal(barcode)!;
  const etiqueta = piezaRC(ref.receiptNumber, ref.codigo);
  const item = await db.canalReceiptItem.findFirst({
    where: {
      plantId: ctx.plantId,
      codigo: ref.codigo,
      receiptOrder: { receiptNumber: ref.receiptNumber, plantId: ctx.plantId, deletedAt: null },
    },
    select: {
      id: true,
      receiptOrder: { select: { status: true, bodegaId: true, clienteId: true } },
      dispatchOrder: { select: { odNumber: true } },
      canalDispatchOrder: { select: { dcNumber: true } },
    },
  });
  if (!item) throw new NotFoundException(`No se encontró la canal recibida ${etiqueta}.`);
  if (item.receiptOrder.status !== DispatchOrderStatus.facturado || !item.receiptOrder.bodegaId) {
    throw new BadRequestException(
      `La canal ${etiqueta} aún no está en inventario: primero se debe cerrar su orden de recibo RC${ref.receiptNumber}.`,
    );
  }
  if (item.receiptOrder.clienteId !== clienteId) {
    throw new BadRequestException(`La canal ${etiqueta} es de otro cliente.`);
  }
  if (item.dispatchOrder) {
    throw new ConflictException(`La canal ${etiqueta} ya está en la orden de despacho a proceso OD${item.dispatchOrder.odNumber}.`);
  }
  if (item.canalDispatchOrder) {
    throw new ConflictException(`La canal ${etiqueta} ya fue despachada en la orden DC${item.canalDispatchOrder.dcNumber}.`);
  }
  return item.id;
}
