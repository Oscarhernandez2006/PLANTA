import { jsPDF } from 'jspdf';

export interface CabezaPatasTicketData {
  cliente: string;
  reference: number;
  guias: string[];
  consecutivo: number;
  fecha: string;
  hora: string;
}

const PATAS = [
  'Pata delantera izquierda',
  'Pata delantera derecha',
  'Pata trasera izquierda',
  'Pata trasera derecha',
];

/**
 * Genera 1 tiquete por animal: datos del animal + una etiqueta por cada una
 * de sus 4 patas, para imprimir al insensibilizarlo.
 */
export function downloadCabezaPatasTicket(d: CabezaPatasTicketData) {
  // Formato angosto tipo etiqueta térmica (80mm de ancho).
  const doc = new jsPDF({ unit: 'mm', format: [80, 120] });
  const w = 80;
  const margin = 4;
  let y = 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('CABEZA Y PATAS', w / 2, y, { align: 'center' });
  y += 6;

  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  doc.line(margin, y, w - margin, y);
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const linea = (label: string, value: string) => {
    doc.setFont('helvetica', 'bold');
    doc.text(`${label}:`, margin, y);
    doc.setFont('helvetica', 'normal');
    doc.text(value || '—', margin + 22, y);
    y += 5;
  };
  linea('Animal N.º', String(d.consecutivo));
  linea('Lote', String(d.reference));
  linea('Cliente', d.cliente);
  linea('Guía', d.guias.join(', ') || '—');
  linea('Fecha', d.fecha);
  linea('Hora', d.hora);

  y += 2;
  doc.line(margin, y, w - margin, y);
  y += 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('PATAS', w / 2, y, { align: 'center' });
  y += 6;

  doc.setFontSize(9);
  for (const pata of PATAS) {
    doc.rect(margin, y - 4, w - margin * 2, 10);
    doc.setFont('helvetica', 'bold');
    doc.text(`Animal N.º ${d.consecutivo}`, margin + 2, y);
    doc.setFont('helvetica', 'normal');
    doc.text(pata, margin + 2, y + 4);
    y += 13;
  }

  doc.autoPrint();
  const blobUrl = doc.output('bloburl');
  window.open(blobUrl as unknown as string, '_blank');
}
