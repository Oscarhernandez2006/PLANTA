import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import logoUrl from '@/assets/logo-santacruz.png';
import { formatOB } from '../registrar/orden-beneficio-api';
import type { DetalleSacrificio } from './api';

const INK: [number, number, number] = [31, 41, 55];
const GRAY: [number, number, number] = [243, 244, 246];
const TEXT: [number, number, number] = [17, 17, 17];

export const LEYENDA_SACRIFICIO = 'PEP (Peso en pie), PEC (Peso en caliente), RND (Rendimiento = PEC ÷ PEP).';

export const COLUMNAS_SACRIFICIO = [
  'No.',
  'FECHA',
  'CLIENTE',
  'FINCA',
  'LOTE',
  'TIPO',
  'PEP(kg)',
  'TURNO',
  'PEC(kg)',
  'PIEL(kg)',
  'RND(%)',
] as const;

export const num = (n: number | null | undefined, dec = 1) =>
  n == null ? '—' : n.toLocaleString('es-CO', { minimumFractionDigits: dec, maximumFractionDigits: dec });

export const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** Filas del informe (iguales en pantalla, PDF y Excel). */
export function filasSacrificio(d: DetalleSacrificio) {
  return d.animales.map((a) => ({
    no: pad(a.sequence),
    fecha: d.date,
    cliente: d.cliente,
    finca: d.finca ?? '—',
    lote: formatOB(d.reference),
    tipo: a.tipo ?? '—',
    pep: a.pepKg,
    turno: pad(a.turno, 3),
    pec: a.pecKg,
    piel: a.pielKg,
    rnd: a.rendimiento,
  }));
}

const clienteTexto = (d: DetalleSacrificio) =>
  d.clienteNit ? `${d.clienteNit} - ${d.cliente}` : d.cliente;

function ahora() {
  return new Date().toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
}

const nombreArchivo = (d: DetalleSacrificio) => `infosacrificio-${formatOB(d.reference)}-${d.date}`;

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function finalY(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
}

/** Descarga el informe de sacrificio en PDF (A4 horizontal). */
export async function descargarSacrificioPdf(d: DetalleSacrificio, operario: string) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 10;
  const contentW = pageW - margin * 2;

  const headerY = margin;
  const headerH = 22;
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.3);
  doc.rect(margin, headerY, contentW, headerH);
  const img = await loadImage(logoUrl);
  if (img) doc.addImage(img, 'PNG', margin + 4, headerY + 3, 28, 16, undefined, 'FAST');
  doc.setTextColor(...TEXT);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('AGROPECUARIA SANTA CRUZ LTDA', pageW / 2, headerY + 6, { align: 'center' });
  doc.setFontSize(9);
  doc.text('NIT. 830.505.537-2', pageW / 2, headerY + 11, { align: 'center' });
  doc.text('KM 3 VÍA ORIENTAL TEL. 3766701', pageW / 2, headerY + 15, { align: 'center' });
  doc.text('MALAMBO - ATLÁNTICO', pageW / 2, headerY + 19, { align: 'center' });

  const base = {
    margin: { left: margin, right: margin },
    theme: 'grid' as const,
    styles: {
      lineColor: INK,
      lineWidth: 0.25,
      textColor: TEXT,
      fontSize: 8.5,
      cellPadding: 1.2,
      halign: 'center' as const,
    },
  };
  const lbl = { fontStyle: 'bold' as const, fillColor: GRAY };

  autoTable(doc, {
    ...base,
    startY: headerY + headerH,
    styles: { ...base.styles, fontSize: 12, fontStyle: 'bold' },
    body: [[`INFORME DE SACRIFICIO OS No. ${formatOB(d.reference)}`]],
  });

  autoTable(doc, {
    ...base,
    startY: finalY(doc),
    body: [
      [
        { content: 'FECHA DE SACRIFICIO', styles: lbl },
        { content: 'CLIENTE', styles: lbl },
        { content: 'GUÍA', styles: lbl },
        { content: 'FINCA', styles: lbl },
      ],
      [d.date, clienteTexto(d), d.guias.join(', ') || '—', d.finca ?? '—'],
    ],
  });

  autoTable(doc, {
    ...base,
    startY: finalY(doc) + 4,
    headStyles: { fillColor: GRAY, textColor: TEXT, fontStyle: 'bold', lineColor: INK, lineWidth: 0.25 },
    head: [[...COLUMNAS_SACRIFICIO]],
    columnStyles: {
      2: { halign: 'left' },
      3: { halign: 'left' },
      6: { halign: 'right' },
      8: { halign: 'right' },
      9: { halign: 'right' },
      10: { halign: 'right' },
    },
    body: filasSacrificio(d).map((f) => [
      f.no,
      f.fecha,
      f.cliente,
      f.finca,
      f.lote,
      f.tipo,
      num(f.pep),
      f.turno,
      num(f.pec),
      num(f.piel),
      num(f.rnd),
    ]),
  });

  const t = d.totales;
  autoTable(doc, {
    ...base,
    startY: finalY(doc) + 4,
    body: [
      [
        { content: 'ANIMALES', styles: lbl },
        { content: 'PEP(kg)', styles: lbl },
        { content: 'PEC(kg)', styles: lbl },
        { content: 'PIEL(kg)', styles: lbl },
        { content: 'RND(%)', styles: lbl },
      ],
      [String(t.animales), num(t.pepKg), num(t.pecKg), num(t.pielKg), num(t.rendimiento)],
    ],
  });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(LEYENDA_SACRIFICIO, margin, finalY(doc) + 5);

  doc.setFontSize(7.5);
  doc.text('Elaboró: © Grupo Santacruz, 2026', margin, pageH - 8);
  doc.text(`Operario: ${operario.toUpperCase()} | ${ahora()}`, pageW - margin, pageH - 8, {
    align: 'right',
  });

  doc.save(`${nombreArchivo(d)}.pdf`);
}

/** Descarga el informe de sacrificio en Excel, con el mismo formato del PDF. */
export async function descargarSacrificioExcel(d: DetalleSacrificio, operario: string) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Informe de sacrificio', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  });
  [6, 12, 30, 22, 12, 12, 11, 8, 11, 10, 9].forEach((w, i) => (ws.getColumn(i + 1).width = w));

  const cols = 'ABCDEFGHIJK';
  const borde = { style: 'thin' as const };
  const gris = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF3F4F6' } };

  /** Combina un rango, escribe el valor y le da borde/centrado; `label` = negrilla con fondo gris. */
  function celda(
    rango: string,
    valor: string | number | null,
    opts: { label?: boolean; size?: number; align?: 'left' | 'right' | 'center'; fmt?: string } = {},
  ) {
    const [ini, fin] = rango.split(':');
    if (fin) ws.mergeCells(rango);
    const c = ws.getCell(ini);
    c.value = valor ?? '—';
    c.alignment = { horizontal: opts.align ?? 'center', vertical: 'middle', wrapText: true };
    c.font = { bold: !!opts.label || !!opts.size, size: opts.size ?? 10 };
    if (opts.label) c.fill = gris;
    if (opts.fmt && typeof valor === 'number') c.numFmt = opts.fmt;
    const r1 = Number(ini.slice(1));
    const r2 = Number((fin ?? ini).slice(1));
    for (let r = r1; r <= r2; r++) {
      for (let col = cols.indexOf(ini[0]); col <= cols.indexOf((fin ?? ini)[0]); col++) {
        ws.getCell(`${cols[col]}${r}`).border = { top: borde, left: borde, bottom: borde, right: borde };
      }
    }
    return c;
  }

  // Encabezado: logo + datos de la empresa.
  celda('A1:B4', '');
  const logo = await fetch(logoUrl).then((r) => r.arrayBuffer()).catch(() => null);
  if (logo) {
    const id = wb.addImage({ buffer: logo, extension: 'png' });
    ws.addImage(id, { tl: { col: 0.2, row: 0.3 }, ext: { width: 105, height: 62 } });
  }
  celda('C1:K1', 'AGROPECUARIA SANTA CRUZ LTDA', { label: true });
  celda('C2:K2', 'NIT. 830.505.537-2', { label: true });
  celda('C3:K3', 'KM 3 VÍA ORIENTAL TEL. 3766701', { label: true });
  celda('C4:K4', 'MALAMBO - ATLÁNTICO', { label: true });
  ['C1', 'C2', 'C3', 'C4'].forEach((k) => (ws.getCell(k).fill = { type: 'pattern', pattern: 'none' }));
  celda('A5:K5', `INFORME DE SACRIFICIO OS No. ${formatOB(d.reference)}`, { size: 13 });

  celda('A6:B6', 'FECHA DE SACRIFICIO', { label: true });
  celda('C6:D6', 'CLIENTE', { label: true });
  celda('E6:H6', 'GUÍA', { label: true });
  celda('I6:K6', 'FINCA', { label: true });
  celda('A7:B7', d.date);
  celda('C7:D7', clienteTexto(d));
  celda('E7:H7', d.guias.join(', ') || '—');
  celda('I7:K7', d.finca ?? '—');

  // Detalle por animal.
  COLUMNAS_SACRIFICIO.forEach((t, i) => celda(`${cols[i]}9`, t, { label: true }));
  let row = 10;
  for (const f of filasSacrificio(d)) {
    const valores: [string | number | null, 'left' | 'right' | 'center', string?][] = [
      [f.no, 'center'],
      [f.fecha, 'center'],
      [f.cliente, 'left'],
      [f.finca, 'left'],
      [f.lote, 'center'],
      [f.tipo, 'center'],
      [f.pep, 'right', '#,##0.0'],
      [f.turno, 'center'],
      [f.pec, 'right', '#,##0.0'],
      [f.piel, 'right', '#,##0.0'],
      [f.rnd, 'right', '0.0'],
    ];
    valores.forEach(([v, align, fmt], i) => celda(`${cols[i]}${row}`, v, { align, fmt }));
    row++;
  }

  // Totales.
  row++;
  const t = d.totales;
  celda(`A${row}:C${row}`, 'ANIMALES', { label: true });
  celda(`D${row}:E${row}`, 'PEP(kg)', { label: true });
  celda(`F${row}:G${row}`, 'PEC(kg)', { label: true });
  celda(`H${row}:I${row}`, 'PIEL(kg)', { label: true });
  celda(`J${row}:K${row}`, 'RND(%)', { label: true });
  celda(`A${row + 1}:C${row + 1}`, t.animales);
  celda(`D${row + 1}:E${row + 1}`, t.pepKg, { fmt: '#,##0.0' });
  celda(`F${row + 1}:G${row + 1}`, t.pecKg, { fmt: '#,##0.0' });
  celda(`H${row + 1}:I${row + 1}`, t.pielKg, { fmt: '#,##0.0' });
  celda(`J${row + 1}:K${row + 1}`, t.rendimiento, { fmt: '0.0' });

  row += 3;
  ws.getCell(`A${row}`).value = LEYENDA_SACRIFICIO;
  ws.getCell(`A${row}`).font = { bold: true, size: 9 };
  row += 2;
  ws.getCell(`A${row}`).value = 'Elaboró: © Grupo Santacruz, 2026';
  ws.getCell(`A${row}`).font = { bold: true, size: 9 };
  ws.getCell(`A${row + 1}`).value = `Operario: ${operario.toUpperCase()} | ${ahora()}`;
  ws.getCell(`A${row + 1}`).font = { bold: true, size: 9 };

  const buffer = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = `${nombreArchivo(d)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
