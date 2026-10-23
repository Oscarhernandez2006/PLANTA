import { jsPDF } from 'jspdf';
import autoTable, { type CellInput } from 'jspdf-autotable';
import logoUrl from '@/assets/logo-santacruz.png';
import { formatOB } from '../registrar/orden-beneficio-api';
import { codigoBarras } from '../canal-caliente/canal-presinto-print';
import type { CanalAnimalTipo } from '../canal-caliente/api';
import type { DetalleSacrificio } from './api';

const INK: [number, number, number] = [31, 41, 55];
const GRAY: [number, number, number] = [243, 244, 246];
const TEXT: [number, number, number] = [17, 17, 17];

export const LEYENDA_SACRIFICIO = 'PEP(Peso En Pie), PEC(Peso En Caliente), RND(Rendimiento) PROM(Promedio).';

/** Columnas del detalle por animal, agrupadas como en el reporte de beneficio. */
export const GRUPOS_SACRIFICIO = [
  { titulo: 'SACRIFICIO', columnas: ['GUÍA', 'REF.'] },
  { titulo: 'ANIMAL', columnas: ['TIPO', 'CÓDIGO', 'TURNO'] },
  { titulo: 'PESAJE', columnas: ['PEP(kg)', 'PEC(kg)', 'PIEL(kg)'] },
  { titulo: 'LOGÍSTICA', columnas: ['OBSERVACIÓN', 'UBICACIÓN', 'DESTINO'] },
] as const;

export const COLUMNAS_SACRIFICIO = [
  'No.',
  'GUÍA',
  'REF.',
  'TIPO',
  'CÓDIGO',
  'TURNO',
  'PEP(kg)',
  'PEC(kg)',
  'PIEL(kg)',
  'RND(%)',
  'OBSERVACIÓN',
  'UBICACIÓN',
  'DESTINO',
] as const;

export const num = (n: number | null | undefined, dec = 1) =>
  n == null ? '—' : n.toLocaleString('es-CO', { minimumFractionDigits: dec, maximumFractionDigits: dec });

export const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** Filas del informe (iguales en pantalla, PDF y Excel). */
export function filasSacrificio(d: DetalleSacrificio) {
  return d.animales.map((a) => ({
    no: a.sequence,
    guia: a.guia ?? '—',
    ref: a.referencia ?? '—',
    tipo: a.tipo ?? '—',
    // Código del precinto de cada pieza pesada (en media canal, CIZQ / CDER).
    codigo:
      a.canalTipo && a.piezas.length
        ? a.piezas
            .map((p) =>
              codigoBarras({ lote: d.reference, turno: p.turno ?? a.turno, canalTipo: a.canalTipo!, pieza: p.pieza }),
            )
            .join(' / ')
        : '—',
    turno: a.turno,
    pep: a.pepKg,
    pec: a.pecKg,
    piel: a.pielKg,
    rnd: a.rendimiento,
    observacion: a.observacion ?? '',
    ubicacion: a.ubicacion ?? '',
    destino: a.destino ?? '',
  }));
}

const HEMBRAS: CanalAnimalTipo[] = ['vaca', 'novilla', 'bufala'];
export const TIPOS_ANIMAL: [CanalAnimalTipo, string][] = [
  ['vaca', 'VACA'],
  ['novilla', 'NOVILLA'],
  ['toro', 'TORO'],
  ['novillo', 'NOVILLO'],
  ['bufalo', 'BUFALO'],
  ['bufala', 'BUFALA'],
];

/** Conteo de animales por sexo y por tipo (clasificación de Canal Caliente). */
export function conteoAnimales(d: DetalleSacrificio) {
  const tipos = Object.fromEntries(TIPOS_ANIMAL.map(([t]) => [t, 0])) as Record<CanalAnimalTipo, number>;
  let hembras = 0;
  let machos = 0;
  for (const a of d.animales) {
    if (!a.canalAnimalTipo) continue;
    tipos[a.canalAnimalTipo]++;
    if (HEMBRAS.includes(a.canalAnimalTipo)) hembras++;
    else machos++;
  }
  return { hembras, machos, tipos };
}

export const clienteTexto = (d: DetalleSacrificio) =>
  d.clienteNit ? `${d.clienteNit} - ${d.cliente}` : d.cliente;

export const tituloSacrificio = (d: DetalleSacrificio) =>
  `REPORTE BENEFICIO DE ANIMALES ORDEN/LOTE No. ${formatOB(d.reference)}`;

/** Guías del encabezado; si no hay datos de Peso en Camión, al menos el número. */
export const guiasEncabezado = (d: DetalleSacrificio) =>
  d.guiasDetalle?.length
    ? d.guiasDetalle
    : d.guias.map((guia) => ({ guia, referencia: null, proveedor: null, procedencia: d.finca }));

function ahora() {
  return new Date().toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
}

const nombreArchivo = (d: DetalleSacrificio) => `infobeneficio-${formatOB(d.reference)}-${d.date}`;

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

/** Descarga el reporte de beneficio de animales en PDF (A4 vertical). */
export async function descargarSacrificioPdf(d: DetalleSacrificio, operario: string) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 8;
  const contentW = pageW - margin * 2;

  // Encabezado: logo | datos de la empresa | recuadro vacío.
  const headerY = margin;
  const headerH = 22;
  const logoW = 0.22 * contentW;
  const derW = 0.22 * contentW;
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.3);
  doc.rect(margin, headerY, contentW, headerH);
  doc.line(margin + logoW, headerY, margin + logoW, headerY + headerH);
  doc.line(pageW - margin - derW, headerY, pageW - margin - derW, headerY + headerH);
  const img = await loadImage(logoUrl);
  if (img) doc.addImage(img, 'PNG', margin + 6, headerY + 2.5, logoW - 12, headerH - 5, undefined, 'FAST');
  doc.setTextColor(...TEXT);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  const cx = margin + logoW + (contentW - logoW - derW) / 2;
  doc.text('AGROPECUARIA SANTA CRUZ LTDA', cx, headerY + 5, { align: 'center' });
  doc.text('NIT. 830.505.537-2', cx, headerY + 9.5, { align: 'center' });
  doc.text('KM 3 VÍA ORIENTAL TEL. 3766701', cx, headerY + 14, { align: 'center' });
  doc.text('MALAMBO - ATLÁNTICO', cx, headerY + 18.5, { align: 'center' });

  const base = {
    margin: { left: margin, right: margin },
    theme: 'grid' as const,
    styles: {
      lineColor: INK,
      lineWidth: 0.2,
      textColor: TEXT,
      fontSize: 7,
      cellPadding: 0.8,
      halign: 'center' as const,
      valign: 'middle' as const,
    },
  };
  const lbl = { fontStyle: 'bold' as const, fillColor: GRAY };

  autoTable(doc, {
    ...base,
    startY: headerY + headerH,
    styles: { ...base.styles, fontSize: 11, fontStyle: 'bold', fillColor: GRAY },
    body: [[tituloSacrificio(d)]],
  });

  autoTable(doc, {
    ...base,
    startY: finalY(doc),
    columnStyles: { 0: { cellWidth: logoW } },
    body: [
      [
        { content: 'FECHA DE PROCESO', styles: lbl },
        { content: 'CLIENTE', styles: lbl },
      ],
      [d.date, clienteTexto(d)],
      [{ content: 'GUÍAS DE MOVILIZACIÓN DE ANIMALES EN PIE', colSpan: 2, styles: { ...lbl, fontSize: 8 } }],
    ],
  });

  autoTable(doc, {
    ...base,
    startY: finalY(doc),
    columnStyles: { 0: { cellWidth: logoW }, 2: { cellWidth: derW + 14 } },
    body: [
      [
        { content: 'No.', styles: lbl },
        { content: 'PROVEEDOR', styles: lbl },
        { content: 'PROCEDENCIA', styles: lbl },
      ],
      ...guiasEncabezado(d).map((g) => [g.guia, g.proveedor ?? '—', g.procedencia ?? '—']),
    ],
  });

  // Detalle por animal con encabezado agrupado.
  const head: CellInput[][] = [
    [
      { content: 'No.', rowSpan: 2 },
      ...GRUPOS_SACRIFICIO.slice(0, 3).map((g) => ({ content: g.titulo, colSpan: g.columnas.length })),
      { content: 'RND(%)', rowSpan: 2 },
      { content: GRUPOS_SACRIFICIO[3].titulo, colSpan: GRUPOS_SACRIFICIO[3].columnas.length },
    ],
    GRUPOS_SACRIFICIO.flatMap((g) => [...g.columnas]),
  ];
  autoTable(doc, {
    ...base,
    startY: finalY(doc) + 3,
    headStyles: { fillColor: GRAY, textColor: TEXT, fontStyle: 'bold', lineColor: INK, lineWidth: 0.2, halign: 'center' },
    head,
    columnStyles: {
      6: { halign: 'right' },
      7: { halign: 'right', fontStyle: 'bold' },
      8: { halign: 'right' },
      9: { halign: 'right' },
    },
    body: filasSacrificio(d).map((f) => [
      f.no,
      f.guia,
      f.ref,
      f.tipo,
      f.codigo,
      f.turno,
      num(f.pep),
      num(f.pec),
      num(f.piel),
      num(f.rnd),
      f.observacion,
      f.ubicacion,
      f.destino,
    ]),
  });

  // Animales por sexo y tipo.
  const c = conteoAnimales(d);
  autoTable(doc, {
    ...base,
    startY: finalY(doc) + 4,
    body: [
      [{ content: 'ANIMALES', colSpan: 8, styles: lbl }],
      [
        { content: 'SEXO', colSpan: 2, styles: lbl },
        { content: 'TIPO', colSpan: 6, styles: lbl },
      ],
      [
        { content: 'HEMBRAS', styles: lbl },
        { content: 'MACHOS', styles: lbl },
        ...TIPOS_ANIMAL.map(([, t]) => ({ content: t, styles: lbl })),
      ],
      [
        { content: String(c.hembras), styles: { fontStyle: 'bold' } },
        { content: String(c.machos), styles: { fontStyle: 'bold' } },
        ...TIPOS_ANIMAL.map(([t]) => ({ content: String(c.tipos[t]), styles: { fontStyle: 'bold' as const } })),
      ],
    ],
  });

  // Totales.
  const t = d.totales;
  autoTable(doc, {
    ...base,
    startY: finalY(doc) + 4,
    body: [
      [{ content: 'TOTALES', colSpan: 7, styles: lbl }],
      ['ANIMALES', 'PEP(kg)', 'PIEL(kg)', 'SEBO(kg)', 'PEC(kg)', 'PROM(kg)', 'RND(%)'].map((h) => ({ content: h, styles: lbl })),
      [
        String(t.animales),
        num(t.pepKg),
        num(t.pielKg),
        num(t.seboKg),
        num(t.pecKg),
        num(t.promedioKg),
        num(t.rendimiento),
      ].map((v) => ({ content: v, styles: { fontStyle: 'bold' as const } })),
      [{ content: LEYENDA_SACRIFICIO, colSpan: 7, styles: { halign: 'left' as const, fontStyle: 'bold' as const } }],
    ],
  });

  const pieY = Math.min(finalY(doc) + 6, pageH - 8);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.text('Elaboró: © Grupo Santacruz, 2026', margin, pieY);
  doc.setFontSize(7.5);
  doc.text(`Operario: ${operario.toUpperCase()} | ${ahora()}`, pageW - margin, pieY, { align: 'right' });

  doc.save(`${nombreArchivo(d)}.pdf`);
}

/** Descarga el reporte de beneficio de animales en Excel, con el mismo formato del PDF. */
export async function descargarSacrificioExcel(d: DetalleSacrificio, operario: string) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Reporte beneficio', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  [5, 22, 9, 10, 12, 7, 9, 9, 9, 8, 18, 11, 10].forEach((w, i) => (ws.getColumn(i + 1).width = w));

  const cols = 'ABCDEFGHIJKLM';
  const borde = { style: 'thin' as const };
  const gris = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF3F4F6' } };

  /** Combina un rango, escribe el valor y le da borde/centrado; `label` = negrilla con fondo gris. */
  function celda(
    rango: string,
    valor: string | number | null,
    opts: { label?: boolean; bold?: boolean; size?: number; align?: 'left' | 'right' | 'center'; fmt?: string } = {},
  ) {
    const [ini, fin] = rango.split(':');
    if (fin) ws.mergeCells(rango);
    const c = ws.getCell(ini);
    c.value = valor ?? '—';
    c.alignment = { horizontal: opts.align ?? 'center', vertical: 'middle', wrapText: true };
    c.font = { bold: !!opts.label || !!opts.bold || !!opts.size, size: opts.size ?? 9 };
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
  celda('A1:C4', '');
  const logo = await fetch(logoUrl).then((r) => r.arrayBuffer()).catch(() => null);
  if (logo) {
    const id = wb.addImage({ buffer: logo, extension: 'png' });
    ws.addImage(id, { tl: { col: 0.4, row: 0.2 }, ext: { width: 110, height: 66 } });
  }
  celda('D1:J1', 'AGROPECUARIA SANTA CRUZ LTDA', { bold: true });
  celda('D2:J2', 'NIT. 830.505.537-2', { bold: true });
  celda('D3:J3', 'KM 3 VÍA ORIENTAL TEL. 3766701', { bold: true });
  celda('D4:J4', 'MALAMBO - ATLÁNTICO', { bold: true });
  celda('K1:M4', '');
  celda('A5:M5', tituloSacrificio(d), { size: 12, label: true });

  celda('A6:C6', 'FECHA DE PROCESO', { label: true });
  celda('D6:M6', 'CLIENTE', { label: true });
  celda('A7:C7', d.date);
  celda('D7:M7', clienteTexto(d));
  celda('A8:M8', 'GUÍAS DE MOVILIZACIÓN DE ANIMALES EN PIE', { label: true });
  celda('A9:C9', 'No.', { label: true });
  celda('D9:J9', 'PROVEEDOR', { label: true });
  celda('K9:M9', 'PROCEDENCIA', { label: true });
  let row = 10;
  for (const g of guiasEncabezado(d)) {
    celda(`A${row}:C${row}`, g.guia);
    celda(`D${row}:J${row}`, g.proveedor ?? '—');
    celda(`K${row}:M${row}`, g.procedencia ?? '—');
    row++;
  }

  // Detalle por animal con encabezado agrupado.
  row++;
  celda(`A${row}:A${row + 1}`, 'No.', { label: true });
  celda(`B${row}:C${row}`, 'SACRIFICIO', { label: true });
  celda(`D${row}:F${row}`, 'ANIMAL', { label: true });
  celda(`G${row}:I${row}`, 'PESAJE', { label: true });
  celda(`J${row}:J${row + 1}`, 'RND(%)', { label: true });
  celda(`K${row}:M${row}`, 'LOGÍSTICA', { label: true });
  const sub = GRUPOS_SACRIFICIO.flatMap((g) => [...g.columnas]);
  ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'K', 'L', 'M'].forEach((col, i) => celda(`${col}${row + 1}`, sub[i], { label: true }));
  row += 2;
  for (const f of filasSacrificio(d)) {
    const valores: [string | number | null, 'left' | 'right' | 'center', string?, boolean?][] = [
      [f.no, 'center'],
      [f.guia, 'center'],
      [f.ref, 'center'],
      [f.tipo, 'center'],
      [f.codigo, 'center'],
      [f.turno, 'center'],
      [f.pep, 'right', '#,##0.0'],
      [f.pec, 'right', '#,##0.0', true],
      [f.piel, 'right', '#,##0.0'],
      [f.rnd, 'right', '0.0'],
      [f.observacion, 'center'],
      [f.ubicacion, 'center'],
      [f.destino, 'center'],
    ];
    valores.forEach(([v, align, fmt, bold], i) => celda(`${cols[i]}${row}`, v, { align, fmt, bold }));
    row++;
  }

  // Animales por sexo y tipo.
  row++;
  const c = conteoAnimales(d);
  celda(`A${row}:M${row}`, 'ANIMALES', { label: true });
  celda(`A${row + 1}:D${row + 1}`, 'SEXO', { label: true });
  celda(`E${row + 1}:M${row + 1}`, 'TIPO', { label: true });
  const rangosAnimales = ['A:B', 'C:D', 'E:E', 'F:G', 'H:H', 'I:J', 'K:L', 'M:M'];
  const titulosAnimales = ['HEMBRAS', 'MACHOS', ...TIPOS_ANIMAL.map(([, t]) => t)];
  const valoresAnimales = [c.hembras, c.machos, ...TIPOS_ANIMAL.map(([t]) => c.tipos[t])];
  rangosAnimales.forEach((rg, i) => {
    const [a, b] = rg.split(':');
    celda(a === b ? `${a}${row + 2}` : `${a}${row + 2}:${b}${row + 2}`, titulosAnimales[i], { label: true });
    celda(a === b ? `${a}${row + 3}` : `${a}${row + 3}:${b}${row + 3}`, valoresAnimales[i], { bold: true });
  });

  // Totales.
  row += 5;
  const t = d.totales;
  celda(`A${row}:M${row}`, 'TOTALES', { label: true });
  const rangosTot = ['A:B', 'C:D', 'E:F', 'G:H', 'I:J', 'K:K', 'L:M'];
  const titulosTot = ['ANIMALES', 'PEP(kg)', 'PIEL(kg)', 'SEBO(kg)', 'PEC(kg)', 'PROM(kg)', 'RND(%)'];
  const valoresTot: [number | null, string?][] = [
    [t.animales],
    [t.pepKg, '#,##0.0'],
    [t.pielKg, '#,##0.0'],
    [t.seboKg, '#,##0.0'],
    [t.pecKg, '#,##0.0'],
    [t.promedioKg, '#,##0.0'],
    [t.rendimiento, '0.0'],
  ];
  rangosTot.forEach((rg, i) => {
    const [a, b] = rg.split(':');
    celda(a === b ? `${a}${row + 1}` : `${a}${row + 1}:${b}${row + 1}`, titulosTot[i], { label: true });
    celda(a === b ? `${a}${row + 2}` : `${a}${row + 2}:${b}${row + 2}`, valoresTot[i][0], { bold: true, fmt: valoresTot[i][1] });
  });
  celda(`A${row + 3}:M${row + 3}`, LEYENDA_SACRIFICIO, { bold: true, align: 'left' });

  row += 5;
  ws.getCell(`A${row}`).value = 'Elaboró: © Grupo Santacruz, 2026';
  ws.getCell(`A${row}`).font = { bold: true, size: 8 };
  ws.getCell(`H${row}`).value = `Operario: ${operario.toUpperCase()} | ${ahora()}`;
  ws.getCell(`H${row}`).font = { bold: true, size: 9 };

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
