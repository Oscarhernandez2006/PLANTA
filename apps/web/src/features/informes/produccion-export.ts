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
    canastillas: d.etiquetado.reduce((a, r) => a + r.canastillas, 0),
    unds: d.etiquetado.reduce((a, r) => a + r.unds, 0),
    kg: d.etiquetado.reduce((a, r) => a + r.kg, 0),
    rendimiento: d.etiquetado.reduce((a, r) => a + r.rendimiento, 0),
  };
}

const ORDEN_TIPOS = ['MATERIA PRIMA', 'EN PROCESO', 'SUBPRODUCTO', 'TERMINADO'];

/** Resumen, grupos por tipo (ordenados por kg) y resumen por tienda del informe de producción. */
export function analisisProduccion(d: DetalleProduccion) {
  const mp = totalesProduccion(d);
  const te = totalesEtiquetado(d);
  const canales = d.canales ?? mp.piezas;
  const fila = (r: DetalleProduccion['etiquetado'][number]) => ({
    ...r,
    kgCanal: canales > 0 ? r.kg / canales : 0,
    undsCanal: canales > 0 ? r.unds / canales : 0,
    participacion: te.kg > 0 ? (r.kg / te.kg) * 100 : 0,
  });
  const porTipo = new Map<string, ReturnType<typeof fila>[]>();
  for (const r of d.etiquetado) {
    const t = r.tipo ?? 'MATERIA PRIMA';
    porTipo.set(t, [...(porTipo.get(t) ?? []), fila(r)]);
  }
  const grupos = [...porTipo]
    .sort(([a], [b]) => (ORDEN_TIPOS.indexOf(a) + 99) % 99 - (ORDEN_TIPOS.indexOf(b) + 99) % 99)
    .map(([tipo, filas]) => {
      const ordenadas = filas.sort((a, b) => b.kg - a.kg);
      const kgG = ordenadas.reduce((s, r) => s + r.kg, 0);
      return {
        tipo,
        filas: ordenadas,
        canastillas: ordenadas.reduce((s, r) => s + r.canastillas, 0),
        unds: ordenadas.reduce((s, r) => s + r.unds, 0),
        kg: kgG,
        rendimiento: ordenadas.reduce((s, r) => s + r.rendimiento, 0),
        participacion: te.kg > 0 ? (kgG / te.kg) * 100 : 0,
      };
    });
  const tiendasMap = new Map<string, { tienda: string; canastillas: number; unds: number; kg: number }>();
  for (const r of d.etiquetado) {
    const k = `${r.tiendaCodigo} - ${r.tienda}`;
    const t = tiendasMap.get(k) ?? { tienda: k, canastillas: 0, unds: 0, kg: 0 };
    t.canastillas += r.canastillas;
    t.unds += r.unds;
    t.kg += r.kg;
    tiendasMap.set(k, t);
  }
  return {
    mpKg: mp.kg,
    canales,
    producidoKg: te.kg,
    rendimiento: mp.kg > 0 ? (te.kg / mp.kg) * 100 : 0,
    diferenciaKg: mp.kg - te.kg,
    canastillas: te.canastillas,
    unds: te.unds,
    grupos,
    tiendas: [...tiendasMap.values()],
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

  const an = analisisProduccion(d);
  autoTable(doc, {
    ...base,
    startY: finalY(doc) + 4,
    body: [
      ['GUÍAS', 'ÓRDENES DE BENEFICIO', 'FECHA DE PROCESO', 'CIERRE'].map((t) => ({ content: t, styles: lbl })),
      [
        d.guias?.join(', ') || '—',
        d.obReferencias?.map((n) => `OB${n}`).join(', ') || '—',
        d.processDate,
        d.cerradaAt
          ? `${new Date(d.cerradaAt).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}${d.cerradaPor ? `\n${d.cerradaPor}` : ''}`
          : '—',
      ],
    ],
  });

  autoTable(doc, {
    ...base,
    startY: finalY(doc) + 4,
    body: [
      ['MATERIA PRIMA', 'PRODUCIDO', 'RENDIMIENTO', 'DIFERENCIA', 'CANASTILLAS', 'PROM. POR CANAL'].map((t) => ({
        content: t,
        styles: lbl,
      })),
      [
        `${kg(an.mpKg)} kg\n${an.canales} canales`,
        `${kg(an.producidoKg)} kg\n${an.unds} unds`,
        { content: `${kg(an.rendimiento)} %`, styles: rojo },
        `${kg(an.diferenciaKg)} kg`,
        String(an.canastillas),
        `${kg(an.canales ? an.producidoKg / an.canales : 0)} kg`,
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
  const porCanal = (n: number) => kg(an.canales ? n / an.canales : 0);
  const variosTipos = an.grupos.length > 1;
  autoTable(doc, {
    ...base,
    startY: finalY(doc) + 4,
    styles: { ...base.styles, fontSize: 8 },
    headStyles: { fillColor: GRAY, textColor: TEXT, fontStyle: 'bold', lineColor: INK, lineWidth: 0.25 },
    head: [
      [{ content: `ORDEN DE PRODUCCIÓN (PESAJE Y ETIQUETADO) No. ${d.opNumber}`, colSpan: 10 }],
      ['No.', 'CODIGO', 'PRODUCTO', 'TIENDA', 'CANAST.', 'UNDS', 'CANT.(kg)', 'KG/CANAL', '% PART.', 'RND(%)'],
    ],
    body: [
      ...(d.etiquetado.length
        ? an.grupos.flatMap((g) => [
            ...(variosTipos ? [[{ content: g.tipo, colSpan: 10, styles: { ...lbl, halign: 'left' as const } }]] : []),
            ...g.filas.map((r, i) => [
              String(i + 1).padStart(2, '0'),
              r.codigo,
              { content: r.producto, styles: { halign: 'left' as const } },
              tiendaEtiquetado(r),
              String(r.canastillas),
              String(r.unds),
              { content: kg(r.kg), styles: { halign: 'right' as const } },
              { content: kg(r.kgCanal), styles: { halign: 'right' as const } },
              kg(r.participacion),
              kg(r.rendimiento),
            ]),
            ...(variosTipos
              ? [[
                  { content: `SUBTOTAL ${g.tipo}`, colSpan: 4, styles: { ...lbl, halign: 'right' as const } },
                  { content: String(g.canastillas), styles: lbl },
                  { content: String(g.unds), styles: lbl },
                  { content: kg(g.kg), styles: { ...lbl, halign: 'right' as const } },
                  { content: porCanal(g.kg), styles: { ...lbl, halign: 'right' as const } },
                  { content: kg(g.participacion), styles: lbl },
                  { content: kg(g.rendimiento), styles: lbl },
                ]]
              : []),
          ])
        : [[{ content: 'Aún no hay productos etiquetados.', colSpan: 10 }]]),
      [
        { content: 'TOTALES', colSpan: 4, styles: { ...lbl, halign: 'right' as const } },
        { content: `${te.canastillas}`, styles: lbl },
        { content: String(te.unds), styles: lbl },
        { content: kg(te.kg), styles: { ...lbl, halign: 'right' as const } },
        { content: porCanal(te.kg), styles: { ...lbl, halign: 'right' as const } },
        { content: '100,00', styles: lbl },
        { content: kg(te.rendimiento), styles: lbl },
      ],
    ],
  });

  // Gráfica: kg por producto (barras horizontales).
  const barras = an.grupos.flatMap((g) => g.filas).sort((a, b) => b.kg - a.kg);
  if (barras.length) {
    const altoBarra = 5;
    const alto = 10 + barras.length * altoBarra;
    let y = finalY(doc) + 6;
    if (y + alto > pageH - 14) {
      doc.addPage();
      y = margin;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...TEXT);
    doc.text('KG POR PRODUCTO', margin, y + 4);
    const maxKg = Math.max(...barras.map((b) => b.kg));
    const xBarra = margin + 62;
    const anchoMax = contentW - 62 - 22;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    barras.forEach((b, i) => {
      const yy = y + 8 + i * altoBarra;
      doc.setTextColor(...TEXT);
      doc.text(b.producto.slice(0, 38), margin, yy + 3);
      doc.setFillColor(14, 107, 92);
      doc.rect(xBarra, yy, maxKg ? (b.kg / maxKg) * anchoMax : 0, altoBarra - 1.4, 'F');
      doc.text(`${kg(b.kg)} kg`, xBarra + (maxKg ? (b.kg / maxKg) * anchoMax : 0) + 1.5, yy + 3);
    });
  }

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text('Elaboró: © Grupo Santacruz, 2026', margin, pageH - 8);
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
  [8, 14, 24, 20, 14, 10, 14, 12, 12, 10].forEach((w, i) => (ws.getColumn(i + 1).width = w));

  const borde = { style: 'thin' as const };
  const gris = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF3F4F6' } };
  const cols = 'ABCDEFGHIJ';

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

  const an = analisisProduccion(d);
  celda('A13:B13', 'GUÍAS', { label: true });
  celda('C13:D13', 'ÓRDENES DE BENEFICIO', { label: true });
  celda('E13:F13', 'FECHA DE PROCESO', { label: true });
  celda('G13:H13', 'CIERRE', { label: true });
  celda('A14:B14', d.guias?.join(', ') || '—');
  celda('C14:D14', d.obReferencias?.map((n) => `OB${n}`).join(', ') || '—');
  celda('E14:F14', d.processDate);
  celda(
    'G14:H14',
    d.cerradaAt
      ? `${new Date(d.cerradaAt).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}${d.cerradaPor ? ` · ${d.cerradaPor}` : ''}`
      : '—',
  );

  celda('A16:B16', 'MATERIA PRIMA (kg)', { label: true });
  celda('C16', 'PRODUCIDO (kg)', { label: true });
  celda('D16', 'RENDIMIENTO (%)', { label: true });
  celda('E16:F16', 'DIFERENCIA (kg)', { label: true });
  celda('G16', 'CANASTILLAS', { label: true });
  celda('H16', 'KG POR CANAL', { label: true });
  celda('A17:B17', Number(an.mpKg.toFixed(2))).numFmt = '#,##0.00';
  celda('C17', Number(an.producidoKg.toFixed(2))).numFmt = '#,##0.00';
  celda('D17', Number(an.rendimiento.toFixed(2)), { rojo: true }).numFmt = '0.00';
  celda('E17:F17', Number(an.diferenciaKg.toFixed(2))).numFmt = '#,##0.00';
  celda('G17', an.canastillas);
  celda('H17', Number((an.canales ? an.producidoKg / an.canales : 0).toFixed(2))).numFmt = '#,##0.00';

  celda('A19:H19', `ORDEN DE TRASLADO DE M.P A SALA No. ${d.odNumber}`, { label: true });
  celda('A20', 'No.', { label: true });
  celda('B20', 'CODIGO', { label: true });
  celda('C20:F20', 'PRODUCTO', { label: true });
  celda('G20', 'PIEZAS', { label: true });
  celda('H20', 'CANT.(kg)', { label: true });
  let row = 21;
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

  // Pesaje y etiquetado: una fila consolidada por producto + tienda.
  const te = totalesEtiquetado(d);
  row += 2;
  celda(`A${row}:J${row}`, `ORDEN DE PRODUCCIÓN (PESAJE Y ETIQUETADO) No. ${d.opNumber}`, { label: true });
  row++;
  ['No.', 'CODIGO', 'PRODUCTO', 'TIENDA', 'CANASTILLAS', 'UNDS', 'CANT.(kg)', 'KG/CANAL', '% PART.', 'RND(%)'].forEach(
    (t, i) => celda(`${cols[i]}${row}`, t, { label: true }),
  );
  row++;
  const porCanal = (n: number) => Number((an.canales ? n / an.canales : 0).toFixed(2));
  const variosTipos = an.grupos.length > 1;
  for (const g of an.grupos) {
    if (variosTipos) {
      celda(`A${row}:J${row}`, g.tipo, { label: true });
      row++;
    }
    g.filas.forEach((r, i) => {
      celda(`A${row}`, String(i + 1).padStart(2, '0'));
      celda(`B${row}`, r.codigo);
      celda(`C${row}`, r.producto);
      celda(`D${row}`, tiendaEtiquetado(r));
      celda(`E${row}`, r.canastillas);
      celda(`F${row}`, r.unds);
      celda(`G${row}`, r.kg, { right: true }).numFmt = '#,##0.00';
      celda(`H${row}`, porCanal(r.kg), { right: true }).numFmt = '#,##0.00';
      celda(`I${row}`, Number(r.participacion.toFixed(2))).numFmt = '0.00';
      celda(`J${row}`, r.rendimiento).numFmt = '0.00';
      row++;
    });
    if (variosTipos) {
      celda(`A${row}:D${row}`, `SUBTOTAL ${g.tipo}`, { label: true, right: true });
      celda(`E${row}`, g.canastillas, { label: true });
      celda(`F${row}`, g.unds, { label: true });
      celda(`G${row}`, Number(g.kg.toFixed(2)), { label: true, right: true }).numFmt = '#,##0.00';
      celda(`H${row}`, porCanal(g.kg), { label: true, right: true }).numFmt = '#,##0.00';
      celda(`I${row}`, Number(g.participacion.toFixed(2)), { label: true }).numFmt = '0.00';
      celda(`J${row}`, Number(g.rendimiento.toFixed(2)), { label: true }).numFmt = '0.00';
      row++;
    }
  }
  celda(`A${row}:D${row}`, 'TOTALES', { label: true, right: true });
  celda(`E${row}`, te.canastillas, { label: true });
  celda(`F${row}`, te.unds, { label: true });
  celda(`G${row}`, Number(te.kg.toFixed(2)), { label: true, right: true }).numFmt = '#,##0.00';
  celda(`H${row}`, porCanal(te.kg), { label: true, right: true }).numFmt = '#,##0.00';
  celda(`I${row}`, 100, { label: true }).numFmt = '0.00';
  celda(`J${row}`, Number(te.rendimiento.toFixed(2)), { label: true }).numFmt = '0.00';

  row += 2;
  ws.getCell(`A${row}`).value = 'Elaboró: © Grupo Santacruz, 2026';
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
