import { formatPieza } from './api';

/** Datos del rótulo de una canal recibida. */
export interface RotuloReciboDatos {
  receiptNumber: number;
  codigo: number;
  cliente: string;
  sede: string;
  guia: string;
  lote: string;
  identificacion: string;
  cava: number;
  pesoKg: number;
  fecha: string;
}

/** ZPL no permite `^` ni `~` dentro de `^FD`. */
const limpiar = (s: string) => s.replace(/[\^~]/g, ' ').toUpperCase();

const recortar = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}.` : s);

/**
 * Rótulo de Recibo de Canales (mismo rollo que las etiquetas de Rotulado, ~10 x 6 cm a 203 dpi).
 * Primera versión sin calibrar en la impresora física: puede requerir ajuste de posiciones.
 */
export function generarRotuloReciboZpl(d: RotuloReciboDatos) {
  const pieza = formatPieza(d.receiptNumber, d.codigo);
  const texto = (x: number, y: number, alto: number, ancho: number, valor: string) =>
    `^FO${x},${y}^A0N,${alto},${ancho}^FD${limpiar(valor)}^FS`;
  return [
    '^XA',
    '^CI28',
    texto(20, 18, 26, 22, 'AGROPECUARIA SANTACRUZ · RECIBO DE CANALES'),
    `^FO15,52^GB450,2,2^FS`,
    texto(20, 62, 20, 18, recortar(`CLIENTE: ${d.cliente}`, 38)),
    texto(20, 86, 20, 18, recortar(`SEDE: ${d.sede}`, 38)),
    texto(20, 116, 18, 16, 'PIEZA'),
    texto(20, 136, 56, 40, pieza),
    texto(300, 116, 18, 16, 'PESO (kg)'),
    texto(300, 136, 56, 36, d.pesoKg.toFixed(2)),
    `^FO15,200^GB450,2,2^FS`,
    texto(20, 210, 20, 18, recortar(`GUIA: ${d.guia}`, 22)),
    texto(260, 210, 20, 18, `CAVA: ${d.cava}`),
    texto(20, 236, 20, 18, recortar(`LOTE: ${d.lote}`, 22)),
    texto(260, 236, 20, 18, recortar(`IDENT.: ${d.identificacion}`, 18)),
    texto(20, 262, 20, 18, `FECHA: ${d.fecha}`),
    `^FO60,292^BY2,2,70^BCN,70,Y,N,N^FD${limpiar(pieza)}^FS`,
    '^XZ',
  ].join('\n');
}
