import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';

type Db = Prisma.TransactionClient | PrismaService;

/** Diferencia máxima (kg) entre el neto pesado del arrume y el neto de sus etiquetas (merma). */
export const TOLERANCIA_ARRUME_KG = 1;
/** Código de error para que la pantalla muestre la alerta de diferencia del arrume. */
export const DIFERENCIA_ARRUME = 'DIFERENCIA_ARRUME';

export type OrdenArrume = { canalDispatchOrderId: string } | { transferOrderId: string };

const r2 = (n: number) => Math.round(n * 100) / 100;
const fmtKg = (n: number) => n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const lineaSelect = {
  id: true,
  codigo: true,
  unds: true,
  netoEtiquetaKg: true,
  createdAt: true,
  product: { select: { codigo: true, nombre: true } },
} as const;

export const arrumeSelect = {
  id: true,
  canalDispatchOrderId: true,
  transferOrderId: true,
  pesoBrutoKg: true,
  taraCanastillaKg: true,
  taraEstibaKg: true,
  terminadoAt: true,
  createdAt: true,
  despachoItems: { orderBy: { createdAt: 'desc' }, select: lineaSelect },
  trasladoItems: { orderBy: { createdAt: 'desc' }, select: lineaSelect },
} as const satisfies Prisma.ArrumeSelect;

export type ArrumeRow = Prisma.ArrumeGetPayload<{ select: typeof arrumeSelect }>;

/** Totales del arrume: tara = tara por canastilla × canastillas pistoleadas + tara de la estiba. */
export function calcularArrume(a: ArrumeRow) {
  const items = [...a.despachoItems, ...a.trasladoItems];
  const canastillas = items.length;
  const taraTotalKg = r2(Number(a.taraCanastillaKg) * canastillas + Number(a.taraEstibaKg));
  const netoKg = r2(Number(a.pesoBrutoKg) - taraTotalKg);
  const netoEtiquetasKg = r2(items.reduce((s, i) => s + Number(i.netoEtiquetaKg), 0));
  const diferenciaKg = r2(netoKg - netoEtiquetasKg);
  return { items, canastillas, taraTotalKg, netoKg, netoEtiquetasKg, diferenciaKg };
}

export const excedeTolerancia = (diferenciaKg: number) => Math.abs(diferenciaKg) > TOLERANCIA_ARRUME_KG;

export const mensajeDiferencia = (diferenciaKg: number) =>
  `Hay una diferencia superior a ${TOLERANCIA_ARRUME_KG.toFixed(1)} kilos (${fmtKg(diferenciaKg)} kg) entre el peso del arrume y el de las etiquetas.`;

export function arrumeAbierto(db: Db, orden: OrdenArrume) {
  return db.arrume.findFirst({ where: { ...orden, terminadoAt: null }, select: arrumeSelect });
}

/** Al cerrar la orden: no puede quedar un arrume sin terminar (diferencia sin corregir). */
export async function exigirSinArrumeAbierto(db: Db, orden: OrdenArrume) {
  const a = await arrumeAbierto(db, orden);
  if (!a) return;
  const r = calcularArrume(a);
  throw new BadRequestException({
    statusCode: 400,
    error: DIFERENCIA_ARRUME,
    message:
      r.canastillas && excedeTolerancia(r.diferenciaKg)
        ? `No se puede cerrar la orden. ${mensajeDiferencia(r.diferenciaKg)} Corrige la diferencia y termina el arrume.`
        : 'No se puede cerrar la orden: hay un arrume sin terminar. Termínalo o cancélalo.',
  });
}

/**
 * Al quitar una etiqueta de un arrume ya terminado, el arrume se reabre para volver a pesarlo
 * (su peso ya no cuadra). Solo puede haber un arrume abierto por orden.
 */
export async function reabrirArrumeAlQuitar(db: Db, arrumeId: string | null, orden: OrdenArrume) {
  if (!arrumeId) return;
  const a = await db.arrume.findUnique({ where: { id: arrumeId }, select: { terminadoAt: true } });
  if (!a?.terminadoAt) return;
  const otro = await db.arrume.findFirst({ where: { ...orden, terminadoAt: null }, select: { id: true } });
  if (otro) {
    throw new BadRequestException('Termina o cancela el arrume abierto antes de quitar etiquetas de un arrume ya pesado.');
  }
  await db.arrume.update({ where: { id: arrumeId }, data: { terminadoAt: null } });
}
