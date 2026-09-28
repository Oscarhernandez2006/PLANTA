import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import logoUrl from '@/assets/logo-santacruz.png';
import { codigoBarras } from '../canal-caliente/canal-presinto-print';
import type { CanalAnimalTipo } from '../canal-caliente/api';
import { formatOB } from '../registrar/orden-beneficio-api';
import type { DetalleCanalCaliente, DetallePieza } from './api';

const INK: [number, number, number] = [31, 41, 55];
const GRAY: [number, number, number] = [243, 244, 246];
const TEXT: [number, number, number] = [17, 17, 17];

const GENERO: Record<CanalAnimalTipo, string> = {
  vaca: 'HEMBRA/VACA',
  novilla: 'HEMBRA/NOVILLA',
  bufala: 'HEMBRA/BÚFALA',
  toro: 'MACHO/TORO',
  novillo: 'MACHO/NOVILLO',
  bufalo: 'MACHO/BÚFALO',
};

/** Fila del informe, igual para PDF y Excel. */
function filas(d: DetalleCanalCaliente) {
  return d.piezas.map((p: DetallePieza, i) => ({
    no: i + 1,
    lote: formatOB(d.reference),
    fecha: d.date,
    codigo: `A${String(p.sequence).padStart(2, '0')}`,
    turno: p.turno ?? p.sequence,
    genero: p.canalAnimalTipo ? GENERO[p.canalAnimalTipo] : '—',
    barcode: p.canalTipo
      ? codigoBarras({
          lote: d.reference,
          turno: p.turno ?? p.sequence,
          canalTipo: p.canalTipo,
          pieza: p.pieza,
        })
      : '—',
    tipo: p.producto,
    kg: p.pesoKg,
  }));
}

function resumen(d: DetalleCanalCaliente) {
  const total = d.piezas.reduce((a, p) => a + p.pesoKg, 0);
  const promedio = d.piezas.length ? total / d.piezas.length : 0;
  const observaciones = [
    ...new Set(d.piezas.map((p) => p.observaciones?.trim()).filter(Boolean)),
  ].join(' · ');
  return { total, promedio, observaciones };
}

const kg = (n: number, dec = 2) =>
  n.toLocaleString('es-CO', { minimumFractionDigits: dec, maximumFractionDigits: dec });

const clienteTexto = (d: DetalleCanalCaliente) =>
  d.clienteNit ? `${d.clienteNit} - ${d.cliente}` : d.cliente;

function hoy() {
  return new Date().toLocaleDateString('en-CA');
}

function ahora() {
  return new Date().toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
}

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

/** Descarga el reporte como PDF: infodespachocanales{fecha}.pdf */
export async function descargarDespachoPdf(d: DetalleCanalCaliente, operario: string) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 10;
  const contentW = pageW - margin * 2;
  const { total, promedio, observaciones } = resumen(d);

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
    body: [[`REPORTE DESPACHO DE CANALES A CLIENTE No. ${formatOB(d.reference)}`]],
  });

  const third = contentW / 3;
  autoTable(doc, {
    ...base,
    startY: finalY(doc),
    columnStyles: { 0: { cellWidth: third }, 1: { cellWidth: third }, 2: { cellWidth: third } },
    body: [
      [
        { content: 'FECHA DE TRASLADO', styles: lbl },
        { content: 'CLIENTE', colSpan: 2, styles: lbl },
      ],
      [hoy(), { content: clienteTexto(d), colSpan: 2 }],
      [
        { content: 'DESTINO', styles: lbl },
        { content: 'DIRECCIÓN', styles: lbl },
        { content: 'CIUDAD', styles: lbl },
      ],
      [d.destino ?? '—', d.clienteDireccion ?? '—', d.clienteCiudad ?? '—'],
    ],
  });

  autoTable(doc, {
    ...base,
    startY: finalY(doc) + 5,
    headStyles: { fillColor: GRAY, textColor: TEXT, fontStyle: 'bold', lineColor: INK, lineWidth: 0.25 },
    head: [
      [
        { content: 'No.', rowSpan: 2 },
        { content: 'SACRIFICIO', colSpan: 5 },
        { content: 'PIEZA', colSpan: 2 },
        { content: 'CALIENTE(kg)', rowSpan: 2 },
      ],
      ['LOTE', 'FECHA', 'CÓDIGO', 'TURNO', 'GÉNERO', 'BARCODE', 'TIPO'],
    ],
    body: filas(d).map((f) => [
      f.no,
      f.lote,
      f.fecha,
      f.codigo,
      f.turno,
      f.genero,
      f.barcode,
      f.tipo,
      kg(f.kg),
    ]),
  });

  autoTable(doc, {
    ...base,
    startY: finalY(doc) + 5,
    body: [
      [{ content: 'TOTALES', colSpan: 3, styles: lbl }],
      [
        { content: 'PIEZAS', styles: lbl },
        { content: 'CALIENTE(kg)', styles: lbl },
        { content: 'PROMEDIO(kg)', styles: lbl },
      ],
      [String(d.piezas.length), kg(total, 1), kg(promedio, 1)],
    ],
  });

  autoTable(doc, {
    ...base,
    startY: finalY(doc) + 5,
    body: [
      [{ content: 'OBSERVACIONES', styles: lbl }],
      [{ content: observaciones, styles: { minCellHeight: 18, halign: 'left', valign: 'top' } }],
    ],
  });

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text('Elaboró: © FrigoAPP v1.0, 2026', margin, pageH - 8);
  doc.text(`Operario: ${operario.toUpperCase()} | ${ahora()}`, pageW - margin, pageH - 8, {
    align: 'right',
  });

  doc.save(`infodespachocanales${hoy()}.pdf`);
}

/** Descarga el reporte como Excel, con el mismo formato del PDF: infodespachocanales{fecha}.xlsx */
export async function descargarDespachoExcel(d: DetalleCanalCaliente, operario: string) {
  const { default: ExcelJS } = await import('exceljs');
  const { total, promedio, observaciones } = resumen(d);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Despacho canales', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1 },
  });
  [6, 10, 12, 10, 8, 18, 14, 34, 14].forEach((w, i) => (ws.getColumn(i + 1).width = w));

  const borde = { style: 'thin' as const };
  const gris = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF3F4F6' } };

  /** Combina un rango, escribe el valor y le da borde/centrado; `label` = negrilla con fondo gris. */
  function celda(rango: string, valor: string | number, opts: { label?: boolean; size?: number; left?: boolean } = {}) {
    const [ini, fin] = rango.split(':');
    if (fin) ws.mergeCells(rango);
    const c = ws.getCell(ini);
    c.value = valor;
    c.alignment = { horizontal: opts.left ? 'left' : 'center', vertical: 'middle', wrapText: true };
    c.font = { bold: !!opts.label || !!opts.size, size: opts.size ?? 10 };
    if (opts.label) c.fill = gris;
    const cols = 'ABCDEFGHI';
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
  celda('C1:I1', 'AGROPECUARIA SANTA CRUZ LTDA', { label: true });
  celda('C2:I2', 'NIT. 830.505.537-2', { label: true });
  celda('C3:I3', 'KM 3 VÍA ORIENTAL TEL. 3766701', { label: true });
  celda('C4:I4', 'MALAMBO - ATLÁNTICO', { label: true });
  ['C1', 'C2', 'C3', 'C4'].forEach((k) => (ws.getCell(k).fill = { type: 'pattern', pattern: 'none' }));
  celda('A5:I5', `REPORTE DESPACHO DE CANALES A CLIENTE No. ${formatOB(d.reference)}`, { size: 13 });

  celda('A6:C6', 'FECHA DE TRASLADO', { label: true });
  celda('D6:I6', 'CLIENTE', { label: true });
  celda('A7:C7', hoy());
  celda('D7:I7', clienteTexto(d));
  celda('A8:C8', 'DESTINO', { label: true });
  celda('D8:G8', 'DIRECCIÓN', { label: true });
  celda('H8:I8', 'CIUDAD', { label: true });
  celda('A9:C9', d.destino ?? '—');
  celda('D9:G9', d.clienteDireccion ?? '—');
  celda('H9:I9', d.clienteCiudad ?? '—');

  // Detalle de piezas.
  celda('A11:A12', 'No.', { label: true });
  celda('B11:F11', 'SACRIFICIO', { label: true });
  celda('G11:H11', 'PIEZA', { label: true });
  celda('I11:I12', 'CALIENTE(kg)', { label: true });
  ['LOTE', 'FECHA', 'CÓDIGO', 'TURNO', 'GÉNERO', 'BARCODE', 'TIPO'].forEach((t, i) =>
    celda(`${'BCDEFGH'[i]}12`, t, { label: true }),
  );
  let row = 13;
  for (const f of filas(d)) {
    [f.no, f.lote, f.fecha, f.codigo, f.turno, f.genero, f.barcode, f.tipo, f.kg].forEach((v, i) =>
      celda(`${'ABCDEFGHI'[i]}${row}`, v),
    );
    ws.getCell(`I${row}`).numFmt = '#,##0.00';
    row++;
  }

  // Totales.
  row++;
  celda(`A${row}:I${row}`, 'TOTALES', { label: true });
  celda(`A${row + 1}:C${row + 1}`, 'PIEZAS', { label: true });
  celda(`D${row + 1}:F${row + 1}`, 'CALIENTE(kg)', { label: true });
  celda(`G${row + 1}:I${row + 1}`, 'PROMEDIO(kg)', { label: true });
  celda(`A${row + 2}:C${row + 2}`, d.piezas.length);
  celda(`D${row + 2}:F${row + 2}`, Number(total.toFixed(1))).numFmt = '#,##0.0';
  celda(`G${row + 2}:I${row + 2}`, Number(promedio.toFixed(1))).numFmt = '#,##0.0';

  // Observaciones.
  row += 4;
  celda(`A${row}:I${row}`, 'OBSERVACIONES', { label: true });
  celda(`A${row + 1}:I${row + 3}`, observaciones, { left: true });
  ws.getCell(`A${row + 1}`).alignment = { horizontal: 'left', vertical: 'top', wrapText: true };

  // Pie.
  row += 5;
  ws.getCell(`A${row}`).value = 'Elaboró: © FrigoAPP v1.0, 2026';
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
  a.download = `infodespachocanales${hoy()}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
