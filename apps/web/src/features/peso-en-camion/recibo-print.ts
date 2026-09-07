import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface ReciboData {
  guia: string;
  fecha: string;
  proveedor: string;
  procedencia: string;
  ciudad: string;
  cliente: string;
  referencia: string;
  placa: string;
  conductor: string;
  entrada: string;
  salida: string;
  neto: string;
  cantidad: string;
  prom: string;
  observaciones: string;
  operario: string;
  impreso: string;
  logoUrl: string;
}

const INK: [number, number, number] = [31, 41, 55];
const GRAY: [number, number, number] = [243, 244, 246];
const REDBG: [number, number, number] = [251, 233, 233];
const REDTX: [number, number, number] = [127, 29, 29];
const TEXT: [number, number, number] = [17, 17, 17];

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function finalY(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
    .finalY;
}

/** Genera y descarga el recibo como PDF: informerecibovehiculo{fecha}.pdf */
export async function downloadReciboPdf(d: ReciboData) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 12;
  const contentW = pageW - margin * 2;

  // Encabezado: marco con logo + datos de la empresa.
  const headerY = margin;
  const headerH = 22;
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.3);
  doc.rect(margin, headerY, contentW, headerH);

  const img = await loadImage(d.logoUrl);
  if (img) {
    const lw = 26;
    const lh = 16;
    doc.addImage(
      img,
      'PNG',
      margin + 5,
      headerY + (headerH - lh) / 2,
      lw,
      lh,
      undefined,
      'FAST',
    );
  }
  doc.setTextColor(...TEXT);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('AGROPECUARIA SANTA CRUZ LTDA', pageW / 2, headerY + 6, {
    align: 'center',
  });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('NIT. 830.505.537-2', pageW / 2, headerY + 11, { align: 'center' });
  doc.text('KM 3 VÍA ORIENTAL TEL. 3766701', pageW / 2, headerY + 15, {
    align: 'center',
  });
  doc.text('MALAMBO - ATLÁNTICO', pageW / 2, headerY + 19, { align: 'center' });

  let y = headerY + headerH;

  // Título.
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    theme: 'grid',
    styles: {
      fontSize: 11,
      fontStyle: 'bold',
      halign: 'center',
      fillColor: GRAY,
      textColor: TEXT,
      lineColor: INK,
      lineWidth: 0.3,
      cellPadding: 2,
    },
    body: [[`RECIBO DE ANIMALES EN VEHÍCULO GUÍA No. ${d.guia || '—'}`]],
  });
  y = finalY(doc);

  // Datos de la guía.
  const lbl = {
    fontStyle: 'bold' as const,
    fontSize: 8,
    halign: 'center' as const,
    fillColor: REDBG,
    textColor: REDTX,
  };
  const val = { halign: 'center' as const, fontSize: 9, textColor: TEXT };
  const third = contentW / 3;
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    theme: 'grid',
    styles: { lineColor: INK, lineWidth: 0.3, cellPadding: 1.6 },
    columnStyles: {
      0: { cellWidth: third },
      1: { cellWidth: third },
      2: { cellWidth: contentW - third * 2 },
    },
    body: [
      [
        { content: 'FECHA DE INGRESO', styles: lbl },
        { content: 'PROVEEDOR', styles: lbl },
        { content: 'PROCEDENCIA', styles: lbl },
      ],
      [
        { content: d.fecha || '—', styles: val },
        { content: d.proveedor || '—', styles: val },
        { content: d.procedencia || '—', styles: val },
      ],
      [
        { content: 'CIUDAD', styles: lbl },
        { content: 'CLIENTE', styles: lbl },
        { content: 'REFERENCIA', styles: lbl },
      ],
      [
        { content: d.ciudad || '', styles: val },
        { content: d.cliente || '—', styles: val },
        { content: d.referencia || '—', styles: val },
      ],
    ],
  });
  y = finalY(doc) + 3;

  // Pesaje del vehículo (encabezado agrupado).
  const grp = {
    fontStyle: 'bold' as const,
    halign: 'center' as const,
    fillColor: GRAY,
    textColor: TEXT,
    fontSize: 8,
  };
  const right = { halign: 'right' as const };
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    theme: 'grid',
    styles: {
      lineColor: INK,
      lineWidth: 0.3,
      cellPadding: 1.6,
      fontSize: 9,
      halign: 'center',
    },
    headStyles: grp,
    columnStyles: { 0: { cellWidth: 10 } },
    head: [
      [
        { content: 'No.', rowSpan: 2 },
        { content: 'Vehículo', rowSpan: 2 },
        { content: 'Conductor', rowSpan: 2 },
        { content: 'Pesaje de vehículo', colSpan: 3 },
        { content: 'Animales', colSpan: 2 },
      ],
      [
        'Entrada (kg)',
        'Salida (kg)',
        'Neto (kg)',
        'Cant.',
        'Prom. (kg)',
      ],
    ],
    body: [
      [
        '1',
        d.placa || '—',
        d.conductor || '—',
        { content: d.entrada, styles: right },
        { content: d.salida, styles: right },
        { content: d.neto, styles: right },
        { content: d.cantidad, styles: right },
        { content: d.prom, styles: right },
      ],
    ],
  });
  y = finalY(doc) + 3;

  // Observaciones.
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    theme: 'grid',
    styles: { lineColor: INK, lineWidth: 0.3, cellPadding: 2, fontSize: 9 },
    headStyles: {
      fontStyle: 'bold',
      halign: 'center',
      fillColor: GRAY,
      textColor: TEXT,
      fontSize: 8,
    },
    head: [['OBSERVACIONES']],
    body: [[{ content: d.observaciones || ' ', styles: { minCellHeight: 12 } }]],
  });
  y = finalY(doc) + 6;

  // Pie.
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(55, 65, 81);
  doc.text('Agropecuaria Santa Cruz — Sistema de Planta', margin, y);
  doc.text(`Operario: ${d.operario || '—'} | ${d.impreso}`, pageW - margin, y, {
    align: 'right',
  });

  const fecha = d.fecha || new Date().toISOString().slice(0, 10);
  doc.save(`informerecibovehiculo${fecha}.pdf`);
}
