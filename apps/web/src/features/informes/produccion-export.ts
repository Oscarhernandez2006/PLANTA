import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import logoUrl from '@/assets/logo-santacruz.png';
import type { DetalleProduccion, EstadoOP } from './api';
import { formatOD } from '../registrar/orden-despacho-api';
import { formatOP } from '../registrar/orden-produccion-api';

const INK: [number, number, number] = [31, 41, 55];
const GRAY: [number, number, number] = [243, 244, 246];
const TEXT: [number, number, number] = [17, 17, 17];
const RED: [number, number, number] = [220, 38, 38];

export const ESTADO_OP_LABEL: Record<EstadoOP, string> = {
  activo: 'EN PROCESO',
  inactivo: 'INACTIVA',
  facturado: 'FINALIZADA',
};

export const consecutivoProduccion = (d: { opNumber: number; odNumber: number }) =>
  `${formatOD(d.odNumber)}-${formatOP(d.opNumber)}`;

export function totalesProduccion(d: DetalleProduccion) {
  return {
    piezas: d.detalle.reduce((a, r) => a + r.piezas, 0),
    kg: d.detalle.reduce((a, r) => a + r.kg, 0),
  };
}

/** "01 - TIENDA 1" y, si la canastilla lleva sobrantes, cuántos. */
export const tiendaEtiquetado = (r: DetalleProduccion['etiquetado'][number]) =>
  `${r.tiendaCodigo} - ${r.tienda}${r.sobrantes ? ` (${r.sobrantes} SOBRANTE${r.sobrantes > 1 ? 'S' : ''})` : ''}`;

export function totalesEtiquetado(d: DetalleProduccion) {
  return {
    canastillas: d.etiquetado.filter((r) => r.canastilla !== null).length,
    unds: d.etiquetado.reduce((a, r) => a + r.unds, 0),
    kg: d.etiquetado.reduce((a, r) => a + r.kg, 0),
    rendimiento: d.etiquetado.reduce((a, r) => a + r.rendimiento, 0),
  };
}

const kg = (n: number) =>
  n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ahora = () =>
  new Date().toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });

const archivo = (d: DetalleProduccion, ext: string) =>
  `infoproduccion${consecutivoProduccion(d)}.${ext}`;

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

export async function descargarProduccionPdf(d: DetalleProduccion, operario: string) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 10;
  const contentW = pageW - margin * 2;
  const tot = totalesProduccion(d);

  doc.setDrawColor(...INK);
  doc.setLineWidth(0.3);
  doc.rect(margin, margin, contentW, 22);
  const img = await loadImage(logoUrl);
  if (img) doc.addImage(img, 'PNG', margin + 4, margin + 3, 28, 16, undefined, 'FAST');
  doc.setTextColor(...TEXT);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('AGROPECUARIA SANTA CRUZ LTDA', pageW / 2, margin + 6, { align: 'center' });
  doc.setFontSize(9);
  doc.text('NIT. 830.505.537-2', pageW / 2, margin + 11, { align: 'center' });
  doc.text('KM 3 VÍA ORIENTAL TEL. 3766701', pageW / 2, margin + 15, { align: 'center' });
  doc.text('MALAMBO - ATLÁNTICO', pageW / 2, margin + 19, { align: 'center' });

  const base = {
    margin: { left: margin, right: margin },
    theme: 'grid' as const,
    styles: {
      lineColor: INK,
      lineWidth: 0.25,
      textColor: TEXT,
      fontSize: 9,
      cellPadding: 1.4,
      halign: 'center' as const,
    },
  };
  const lbl = { fontStyle: 'bold' as const, fillColor: GRAY };
  const rojo = { fontStyle: 'bold' as const, textColor: RED };

  autoTable(doc, {
    ...base,
    startY: margin + 22,
    styles: { ...base.styles, fontSize: 12, fontStyle: 'bold' },
    body: [[`INFORME DE PRODUCCIÓN CONSECUTIVO: ${consecutivoProduccion(d)} | ${ahora()}`]],
  });

  autoTable(doc, {
    ...base,
    startY: finalY(doc) + 4,
    body: [
      [
        { content: 'CLIENTE', styles: lbl },
        { content: 'PRODUCTO TERMINADO', styles: lbl },
      ],
      [d.cliente, { content: d.productoTerminado ?? '—', styles: rojo }],
    ],
  });

  autoTable(doc, {
    ...base,
    startY: finalY(doc) + 4,
    body: [
      ['CONSECUTIVO', 'FECHA DE SACRIFICIO', 'FECHA DE INGRESO', 'LOTE', 'ESTADO'].map((t) => ({
        content: t,
        styles: lbl,
      })),
      [
        { content: consecutivoProduccion(d), styles: rojo },
        d.fechaSacrificio ?? '—',
        d.fechaIngreso ?? '—',
        String(d.opNumber),
        ESTADO_OP_LABEL[d.status],
      ],
    ],
  });

  autoTable(doc, {
    ...base,
    startY: finalY(doc) + 4,
    headStyles: { fillColor: GRAY, textColor: TEXT, fontStyle: 'bold', lineColor: INK, lineWidth: 0.25 },
    head: [
      [{ content: `ORDEN DE TRASLADO DE M.P A SALA No. ${d.odNumber}`, colSpan: 5 }],
      ['No.', 'CODIGO', 'PRODUCTO', 'PIEZAS', 'CANT.(kg)'],
    ],
    body: [
      ...d.detalle.map((r, i) => [
        String(i + 1).padStart(2, '0'),
        r.codigo,
        r.producto,
        String(r.piezas),
        { content: kg(r.kg), styles: { halign: 'right' as const } },
      ]),
      [
        { content: 'TOTALES', colSpan: 3, styles: { ...lbl, halign: 'right' as const } },
        { content: String(tot.piezas), styles: lbl },
        { content: kg(tot.kg), styles: { ...lbl, halign: 'right' as const } },
      ],
    ],
  });

  const te = totalesEtiquetado(d);
  autoTable(doc, {
    ...base,
    startY: finalY(doc) + 4,
    headStyles: { fillColor: GRAY, textColor: TEXT, fontStyle: 'bold', lineColor: INK, lineWidth: 0.25 },
    head: [
      [{ content: `ORDEN DE PRODUCCIÓN (PESAJE Y ETIQUETADO) No. ${d.opNumber}`, colSpan: 8 }],
      ['No.', 'CODIGO', 'PRODUCTO', 'TIENDA', 'N.º CANASTILLA', 'UNDS', 'CANT.(kg)', 'RND(%)'],
    ],
    body: [
      ...(d.etiquetado.length
        ? d.etiquetado.map((r, i) => [
            String(i + 1).padStart(2, '0'),
            r.codigo,
            r.producto,
            tiendaEtiquetado(r),
            r.canastilla === null ? '—' : String(r.canastilla),
            String(r.unds),
            { content: kg(r.kg), styles: { halign: 'right' as const } },
            kg(r.rendimiento),
          ])
        : [[{ content: 'Aún no hay productos etiquetados.', colSpan: 8 }]]),
      [
        { content: 'TOTALES', colSpan: 4, styles: { ...lbl, halign: 'right' as const } },
        { content: `${te.canastillas} canast.`, styles: lbl },
        { content: String(te.unds), styles: lbl },
        { content: kg(te.kg), styles: { ...lbl, halign: 'right' as const } },
        { content: kg(te.rendimiento), styles: lbl },
      ],
    ],
  });

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text('Elaboró: © FrigoAPP v1.0, 2026', margin, pageH - 8);
  doc.text(`Operario: ${operario.toUpperCase()} | ${ahora()}`, pageW - margin, pageH - 8, {
    align: 'right',
  });
  doc.save(archivo(d, 'pdf'));
}

export async function descargarProduccionExcel(d: DetalleProduccion, operario: string) {
  const { default: ExcelJS } = await import('exceljs');
  const tot = totalesProduccion(d);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Informe producción', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1 },
  });
  [8, 14, 24, 20, 14, 10, 14, 12].forEach((w, i) => (ws.getColumn(i + 1).width = w));

  const borde = { style: 'thin' as const };
  const gris = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF3F4F6' } };
  const cols = 'ABCDEFGH';

  function celda(
    rango: string,
    valor: string | number,
    opts: { label?: boolean; rojo?: boolean; size?: number; right?: boolean } = {},
  ) {
    const [ini, fin] = rango.split(':');
    if (fin) ws.mergeCells(rango);
    const c = ws.getCell(ini);
    c.value = valor;
    c.alignment = { horizontal: opts.right ? 'right' : 'center', vertical: 'middle', wrapText: true };
    c.font = {
      bold: !!opts.label || !!opts.rojo || !!opts.size,
      size: opts.size ?? 10,
      ...(opts.rojo ? { color: { argb: 'FFDC2626' } } : {}),
    };
    if (opts.label) c.fill = gris;
    const r1 = Number(ini.slice(1));
    const r2 = Number((fin ?? ini).slice(1));
    for (let r = r1; r <= r2; r++) {
      for (let col = cols.indexOf(ini[0]); col <= cols.indexOf((fin ?? ini)[0]); col++) {
        ws.getCell(`${cols[col]}${r}`).border = { top: borde, left: borde, bottom: borde, right: borde };
      }
    }
    return c;
  }

  celda('A1:B4', '');
  const logo = await fetch(logoUrl).then((r) => r.arrayBuffer()).catch(() => null);
  if (logo) {
    const id = wb.addImage({ buffer: logo, extension: 'png' });
    ws.addImage(id, { tl: { col: 0.2, row: 0.3 }, ext: { width: 105, height: 62 } });
  }
  celda('C1:H1', 'AGROPECUARIA SANTA CRUZ LTDA', { size: 11 });
  celda('C2:H2', 'NIT. 830.505.537-2');
  celda('C3:H3', 'KM 3 VÍA ORIENTAL TEL. 3766701');
  celda('C4:H4', 'MALAMBO - ATLÁNTICO');
  celda('A5:H5', `INFORME DE PRODUCCIÓN CONSECUTIVO: ${consecutivoProduccion(d)} | ${ahora()}`, { size: 12 });

  celda('A7:D7', 'CLIENTE', { label: true });
  celda('E7:H7', 'PRODUCTO TERMINADO', { label: true });
  celda('A8:D8', d.cliente);
  celda('E8:H8', d.productoTerminado ?? '—', { rojo: true });

  celda('A10:B10', 'CONSECUTIVO', { label: true });
  celda('C10', 'FECHA DE SACRIFICIO', { label: true });
  celda('D10', 'FECHA DE INGRESO', { label: true });
  celda('E10:F10', 'LOTE', { label: true });
  celda('G10:H10', 'ESTADO', { label: true });
  celda('A11:B11', consecutivoProduccion(d), { rojo: true });
  celda('C11', d.fechaSacrificio ?? '—');
  celda('D11', d.fechaIngreso ?? '—');
  celda('E11:F11', d.opNumber);
  celda('G11:H11', ESTADO_OP_LABEL[d.status]);

  celda('A13:H13', `ORDEN DE TRASLADO DE M.P A SALA No. ${d.odNumber}`, { label: true });
  celda('A14', 'No.', { label: true });
  celda('B14', 'CODIGO', { label: true });
  celda('C14:F14', 'PRODUCTO', { label: true });
  celda('G14', 'PIEZAS', { label: true });
  celda('H14', 'CANT.(kg)', { label: true });
  let row = 15;
  d.detalle.forEach((r, i) => {
    celda(`A${row}`, String(i + 1).padStart(2, '0'));
    celda(`B${row}`, r.codigo);
    celda(`C${row}:F${row}`, r.producto);
    celda(`G${row}`, r.piezas);
    celda(`H${row}`, r.kg, { right: true }).numFmt = '#,##0.00';
    row++;
  });
  celda(`A${row}:F${row}`, 'TOTALES', { label: true, right: true });
  celda(`G${row}`, tot.piezas, { label: true });
  celda(`H${row}`, Number(tot.kg.toFixed(2)), { label: true, right: true }).numFmt = '#,##0.00';

  // Pesaje y etiquetado: una fila por canastilla.
  const te = totalesEtiquetado(d);
  row += 2;
  celda(`A${row}:H${row}`, `ORDEN DE PRODUCCIÓN (PESAJE Y ETIQUETADO) No. ${d.opNumber}`, { label: true });
  row++;
  ['No.', 'CODIGO', 'PRODUCTO', 'TIENDA', 'N.º CANASTILLA', 'UNDS', 'CANT.(kg)', 'RND(%)'].forEach((t, i) =>
    celda(`${cols[i]}${row}`, t, { label: true }),
  );
  row++;
  d.etiquetado.forEach((r, i) => {
    celda(`A${row}`, String(i + 1).padStart(2, '0'));
    celda(`B${row}`, r.codigo);
    celda(`C${row}`, r.producto);
    celda(`D${row}`, tiendaEtiquetado(r));
    celda(`E${row}`, r.canastilla ?? '—');
    celda(`F${row}`, r.unds);
    celda(`G${row}`, r.kg, { right: true }).numFmt = '#,##0.00';
    celda(`H${row}`, r.rendimiento).numFmt = '0.00';
    row++;
  });
  celda(`A${row}:D${row}`, 'TOTALES', { label: true, right: true });
  celda(`E${row}`, `${te.canastillas} canast.`, { label: true });
  celda(`F${row}`, te.unds, { label: true });
  celda(`G${row}`, Number(te.kg.toFixed(2)), { label: true, right: true }).numFmt = '#,##0.00';
  celda(`H${row}`, Number(te.rendimiento.toFixed(2)), { label: true }).numFmt = '0.00';

  row += 2;
  ws.getCell(`A${row}`).value = 'Elaboró: © FrigoAPP v1.0, 2026';
  ws.getCell(`A${row}`).font = { bold: true, size: 9 };
  ws.getCell(`A${row + 1}`).value = `Operario: ${operario.toUpperCase()} | ${ahora()}`;
  ws.getCell(`A${row + 1}`).font = { bold: true, size: 9 };

  const buffer = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = archivo(d, 'xlsx');
  a.click();
  URL.revokeObjectURL(url);
}
