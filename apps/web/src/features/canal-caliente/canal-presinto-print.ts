import { jsPDF } from 'jspdf';
import JsBarcode from 'jsbarcode';
import type { CanalTipo, CanalTurno } from './api';

export interface PresintoTicketData {
  fechaSacrificio: string; // DD/MM/YYYY
  lote: number; // referencia de la orden de beneficio
  guia: string;
  expendio: string;
  cliente: string;
  tipoAnimal: string; // etiqueta ya formateada (ej. "BUFALO")
  ref: number; // consecutivo del animal en el día
  turno: CanalTurno;
  pesoKg: number;
  canalTipo: CanalTipo;
}

const TURNO_DIGITO: Record<CanalTurno, 1 | 2> = { manana: 1, tarde: 2 };

/** Dígito del tipo de canal para el código de barras del presinto (acordado con planta). */
const CANAL_TIPO_DIGITO: Record<CanalTipo, 1 | 2 | 3> = {
  canal_completa: 1,
  media_canal_con_cola: 2,
  media_canal_sin_cola: 3,
};

const CANAL_TIPO_TITULO: Record<CanalTipo, string> = {
  canal_completa: 'CANAL COMPLETA',
  media_canal_con_cola: 'MEDIA CANAL CON COLA',
  media_canal_sin_cola: 'MEDIA CANAL SIN COLA',
};

/** Código de barras del presinto: {lote}-{turno}{tipoCanal}, ej. lote 1, turno mañana, media sin cola -> "1-13". */
function codigoBarras(d: PresintoTicketData): string {
  return `${d.lote}-${TURNO_DIGITO[d.turno]}${CANAL_TIPO_DIGITO[d.canalTipo]}`;
}

/**
 * Dibuja el presinto en la página actual del documento (todo en mm, dentro
 * de un lienzo de W x H).
 */
function dibujarTicket(doc: jsPDF, d: PresintoTicketData, W: number, H: number) {
  // Código de barras: se dibuja sobre un canvas y se inserta como imagen.
  const canvas = document.createElement('canvas');
  const codigo = codigoBarras(d);
  JsBarcode(canvas, codigo, {
    format: 'CODE128',
    displayValue: true,
    fontSize: 14,
    height: 40,
    margin: 0,
  });
  const barcodeDataUrl = canvas.toDataURL('image/png');
  const barcodeW = 52;
  const barcodeH = (canvas.height / canvas.width) * barcodeW;
  doc.addImage(barcodeDataUrl, 'PNG', 2, (H - barcodeH) / 2, barcodeW, barcodeH);

  // Datos: dos columnas de campo/valor.
  const labelX1 = 58;
  const valueX1 = 82;
  const labelX2 = 128;
  const valueX2 = 146;
  let y1 = 6;
  let y2 = 6;
  const lineH = 4.4;

  const campo = (
    labelX: number,
    valueX: number,
    y: number,
    label: string,
    value: string,
  ) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text(`${label}:`, labelX, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(value || '—', valueX, y);
  };

  campo(labelX1, valueX1, y1, 'Fecha Sacrificio', d.fechaSacrificio);
  y1 += lineH;
  campo(labelX1, valueX1, y1, 'Lote', String(d.lote));
  y1 += lineH;
  campo(labelX1, valueX1, y1, 'Guia', d.guia);
  y1 += lineH;
  campo(labelX1, valueX1, y1, 'Expendio', d.expendio);
  y1 += lineH;
  campo(labelX1, valueX1, y1, 'Cliente', d.cliente);

  campo(labelX2, valueX2, y2, 'Tipo', d.tipoAnimal);
  y2 += lineH;
  campo(labelX2, valueX2, y2, 'Ref', String(d.ref));
  y2 += lineH;
  campo(labelX2, valueX2, y2, 'Turno', String(TURNO_DIGITO[d.turno]));

  // Recuadro PESO (kg).
  const pesoBoxX = 170;
  const boxW = 26;
  const boxY = 2;
  const boxH = H - 4;
  doc.setLineWidth(0.4);
  doc.rect(pesoBoxX, boxY, boxW, boxH);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.text('PESO (kg)', pesoBoxX + boxW / 2, boxY + 5, { align: 'center' });
  doc.setFontSize(15);
  doc.text(d.pesoKg.toFixed(0), pesoBoxX + boxW / 2, boxY + boxH - 5, {
    align: 'center',
  });

  // Recuadro TURNO.
  const turnoBoxX = pesoBoxX + boxW + 3;
  doc.rect(turnoBoxX, boxY, boxW, boxH);
  doc.setFontSize(6.5);
  doc.text('TURNO', turnoBoxX + boxW / 2, boxY + 5, { align: 'center' });
  doc.setFontSize(15);
  doc.text(String(TURNO_DIGITO[d.turno]), turnoBoxX + boxW / 2, boxY + boxH - 5, {
    align: 'center',
  });

  // Título del tipo de canal, a la derecha.
  const tituloX = turnoBoxX + boxW + 4;
  const titulo = CANAL_TIPO_TITULO[d.canalTipo];
  const palabras = titulo.split(' ');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  const midY = H / 2;
  if (palabras.length > 1) {
    const mitad = Math.ceil(palabras.length / 2);
    doc.text(palabras.slice(0, mitad).join(' '), tituloX, midY - 2);
    doc.text(palabras.slice(mitad).join(' '), tituloX, midY + 6);
  } else {
    doc.text(titulo, tituloX, midY + 2);
  }
}

/**
 * Genera e imprime el presinto de Canal Caliente: tira de 26.5cm x 2.5cm con
 * los datos del animal/pieza pesada y un código de barras real (Code128)
 * para trazabilidad de inventario/despacho. Se imprimen 2 copias iguales
 * (una por página) para pegar una en la canal y conservar la otra.
 */
export function imprimirPresinto(d: PresintoTicketData) {
  const W = 265;
  const H = 25;
  const doc = new jsPDF({ unit: 'mm', format: [W, H], orientation: 'landscape' });

  dibujarTicket(doc, d, W, H);
  doc.addPage([W, H], 'landscape');
  dibujarTicket(doc, d, W, H);

  doc.autoPrint();
  const blobUrl = doc.output('bloburl');
  window.open(blobUrl as unknown as string, '_blank');
}
