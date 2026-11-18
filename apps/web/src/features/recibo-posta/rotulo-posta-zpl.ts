import { CONSERVACION_LABEL, formatPiezaPosta, type Conservacion } from './api';

/** Datos del rótulo de un registro de Recibo en Posta. */
export interface RotuloPostaDatos {
  receiptNumber: number;
  codigo: number;
  cliente: string;
  productoCodigo: string;
  producto: string;
  netoKg: number;
  piezas: number;
  lote: string;
  conservacion: Conservacion;
  recibo: string;
  sacrificio?: string;
  vencimiento?: string;
}

/** ZPL no permite `^` ni `~` dentro de `^FD`. */
const limpiar = (s: string) => s.replace(/[\^~]/g, ' ').toUpperCase();

const recortar = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}.` : s);

/**
 * Rótulo de Recibo en Posta (~10 x 6 cm a 203 dpi).
 * Primera versión sin calibrar en la impresora física: puede requerir ajuste de posiciones.
 */
export function generarRotuloPostaZpl(d: RotuloPostaDatos) {
  const pieza = formatPiezaPosta(d.receiptNumber, d.codigo);
  const texto = (x: number, y: number, alto: number, ancho: number, valor: string) =>
    `^FO${x},${y}^A0N,${alto},${ancho}^FD${limpiar(valor)}^FS`;
  return [
    '^XA',
    '^CI28',
    texto(20, 18, 26, 22, 'AGROPECUARIA SANTACRUZ · RECIBO EN POSTA'),
    `^FO15,52^GB450,2,2^FS`,
    texto(20, 62, 22, 20, recortar(`${d.productoCodigo} ${d.producto}`, 34)),
    texto(20, 90, 18, 16, recortar(`CLIENTE: ${d.cliente}`, 40)),
    texto(20, 118, 18, 16, 'REGISTRO'),
    texto(20, 138, 48, 34, pieza),
    texto(300, 118, 18, 16, 'NETO (kg)'),
    texto(300, 138, 48, 34, d.netoKg.toFixed(2)),
    `^FO15,192^GB450,2,2^FS`,
    texto(20, 202, 20, 18, recortar(`LOTE: ${d.lote}`, 22)),
    texto(260, 202, 20, 18, `PIEZAS: ${d.piezas}`),
    texto(20, 228, 20, 18, `RECIBO: ${d.recibo}`),
    texto(260, 228, 20, 18, `SACRIF.: ${d.sacrificio ?? '—'}`),
    texto(20, 254, 20, 18, `VENCE: ${d.vencimiento ?? '—'}`),
    texto(20, 280, 20, 18, CONSERVACION_LABEL[d.conservacion]),
    `^FO60,308^BY2,2,60^BCN,60,Y,N,N^FD${limpiar(pieza)}^FS`,
    '^XZ',
  ].join('\n');
}
