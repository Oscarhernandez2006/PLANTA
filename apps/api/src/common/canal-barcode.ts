import { CanalPiezaTipo } from '@prisma/client';

/**
 * Interpreta el código de barras del presinto de Canal Caliente:
 * `{lote}-{turno}{dígito}{I|D}` (dígito 1 = canal completa, 2 = izquierda, 3 = derecha).
 */
export function parseCanalBarcode(barcode: string) {
  const m = barcode.trim().toUpperCase().match(/^(\d+)-(\d+)([123])([ID]?)$/);
  if (!m) return null;
  const [, lote, turno, digito, lado] = m;
  const pieza =
    digito === '1'
      ? CanalPiezaTipo.canal
      : lado === 'D' || (!lado && digito === '3')
        ? CanalPiezaTipo.cder
        : CanalPiezaTipo.cizq;
  return { lote: Number(lote), turno: Number(turno), pieza };
}
