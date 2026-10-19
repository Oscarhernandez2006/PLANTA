import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import logoUrl from '@/assets/logo-santacruz.png';
import {
  CANAL_ANIMAL_TIPO_LABEL,
  CANAL_TIPO_LABEL,
  PIEZA_LABEL,
} from '../canal-caliente/api';
import { formatReferencia } from '../peso-en-camion/api';
import { formatOB } from '../registrar/orden-beneficio-api';
import type { DetalleProceso, ProcesoAnimal } from './api';

const INK: [number, number, number] = [31, 41, 55];
const GRAY: [number, number, number] = [243, 244, 246];
const TEXT: [number, number, number] = [17, 17, 17];

export const num = (n: number | null | undefined, dec = 1) =>
  n == null ? '—' : n.toLocaleString('es-CO', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const pad = (n: number, w = 2) => String(n).padStart(w, '0');
export const fechaHora = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : '—';
export const hora = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '—';
const formatBP = (n: number) => `BP${String(n).padStart(6, '0')}`;
const unicos = (xs: (string | null | undefined)[]) =>
  [...new Set(xs.map((x) => x?.trim()).filter(Boolean))].join(', ') || '—';

const ESTADO_OB: Record<string, string> = { activo: 'Activo', inactivo: 'Inactivo', procesado: 'Procesado' };
const ESTADO_GUIA: Record<string, string> = { abierta: 'Abierta', cerrada: 'Cerrada' };
const DESTINO_SUB: Record<string, string> = { empresa: 'Empresa (inventario)', firmante: 'Firmante (retira el cliente)' };

export type Par = [string, string];

/** Bloques clave/valor del encabezado: guía (Peso en Camión), Peso en Pie y Orden de Beneficio. */
export function bloquesResumen(d: DetalleProceso): { titulo: string; datos: Par[] }[] {
  const o = d.orden;
  const g = d.guia;
  const p = d.pie;
  const bloques: { titulo: string; datos: Par[] }[] = [
    {
      titulo: 'ORDEN DE BENEFICIO',
      datos: [
        ['OS No.', formatOB(o.reference)],
        ['Fecha', o.date],
        ['Cliente', o.clienteNit ? `${o.clienteNit} - ${o.cliente}` : o.cliente],
        ['Estado', ESTADO_OB[o.status] ?? o.status],
        ['Animales', `${d.totales.sacrificados} sacrificados de ${o.animalCount}`],
        ['Guías', o.guias.join(', ') || '—'],
        ['Destino subproductos', DESTINO_SUB[o.subproductoDestino] ?? o.subproductoDestino],
        ['Retiro subproductos', o.subproductoRetiroAt ? `${fechaHora(o.subproductoRetiroAt)} · ${o.subproductoRetiroPor ?? '—'}` : '—'],
        ['Cabeza y patas', o.cabezasPatas ? 'Sí' : 'No'],
        ['Creada por', `${o.creadaPor ?? '—'} · ${fechaHora(o.createdAt)}`],
        ['Observaciones', o.observaciones || '—'],
      ],
    },
  ];
  bloques.push({
    titulo: 'GUÍA / PESO EN CAMIÓN',
    datos: g
      ? [
          ['Guía de movilización', g.guia ?? '—'],
          ['Consecutivo BC', formatReferencia(g.bcReference)],
          ['Fecha', g.date],
          ['Finca (procedencia)', g.procedencia ?? '—'],
          ['Proveedor', g.proveedor ?? '—'],
          ['Cliente', g.cliente ?? '—'],
          ['Placa', g.placa ?? '—'],
          ['Conductor', g.conductor ?? '—'],
          ['Cantidad de animales', g.cantidad == null ? '—' : String(g.cantidad)],
          ['Entrada (kg)', num(g.entradaKg)],
          ['Salida (kg)', num(g.salidaKg)],
          ['Neto (kg)', num(g.netoKg)],
          ['Promedio por animal (kg)', num(g.promedioKg)],
          ['Estado camión / en pie', `${ESTADO_GUIA[g.estadoCamion]} / ${ESTADO_GUIA[g.estadoPie]}`],
          ['Registrada por', `${g.registradaPor ?? '—'} · ${fechaHora(g.createdAt)}`],
          ['Observaciones', g.observaciones || '—'],
        ]
      : [['Guía', 'No se encontró la guía de la orden en Peso en Camión.']],
  });
  bloques.push({
    titulo: 'PESO EN PIE (GUÍA COMPLETA)',
    datos: p
      ? [
          ['Consecutivo BP', formatBP(p.bpReference)],
          ['Animales pesados', String(p.animales)],
          ['Tipo de pesaje', p.tiposPesaje.map((t) => (t === 'promediado' ? 'Promediado' : 'Individual')).join(', ')],
          ['Corrales', p.corrales.join(', ') || '—'],
          ['Pesaje inicial (kg)', num(p.pesoInicialKg)],
          ['Pesaje actual (kg)', num(p.pesoActualKg)],
          ['Repesajes', String(p.repesajes)],
          ['Merma por repesaje (kg)', num(p.mermaRepesajeKg)],
          ['Diferencia vs neto camión (kg)', num(p.diferenciaVsNetoKg)],
        ]
      : [['Peso en Pie', 'La guía no tiene animales en Peso en Pie.']],
  });
  // Orden del proceso: Peso en Camión → Peso en Pie → Orden de Beneficio.
  const [orden, ...resto] = bloques;
  return [...resto, orden];
}

/** Personal que intervino en cada etapa. */
export function personal(d: DetalleProceso): Par[] {
  const a = d.animales;
  return [
    ['Peso en camión', d.guia?.registradaPor ?? '—'],
    ['Peso en pie', unicos(a.map((x) => x.pie?.operario))],
    ['Sacrificio', unicos(a.map((x) => x.sacrificio.operario))],
    ['Pieles', unicos(a.map((x) => x.piel.operario))],
    ['Canal caliente', unicos(a.flatMap((x) => x.canal.piezas.map((p) => p.operario)))],
  ];
}

export function totalesResumen(d: DetalleProceso): Par[] {
  const t = d.totales;
  return [
    ['Peso en camión (kg)', num(d.guia?.netoKg)],
    ['Peso en pie (kg)', num(t.pepKg)],
    ['Animales sacrificados', `${t.sacrificados} / ${t.animales}`],
    ['Piel (kg)', num(t.pielKg)],
    ['Subproductos (kg)', num(t.subproductosKg)],
    ['Rendimiento (%)', num(t.rendimiento)],
    ['Piezas de canal', String(t.piezasCanal)],
  ];
}

/** Una fila por animal (iguales en pantalla, PDF y Excel). */
export function filasAnimales(d: DetalleProceso) {
  // Peso en camión por animal: promedio de la guía (neto ÷ animales).
  const g = d.guia;
  const pesoCamion =
    g?.promedioKg ?? (g?.netoKg != null && g.cantidad ? g.netoKg / g.cantidad : null);
  return d.animales.map((a: ProcesoAnimal) => {
    const pz = a.canal.piezas;
    return {
      no: pad(a.sequence),
      animal: `A${pad(a.sequence)}`,
      turno: pad(a.turno, 3),
      pesoCamion,
      corral: a.pie?.corral ? `Corral ${a.pie.corral}` : '—',
      sexo: a.pie?.sexo ?? '—',
      pepIni: a.pie?.pesoInicialKg ?? null,
      pep: a.pie?.pesoActualKg ?? null,
      mermaPie: a.pie ? a.pie.mermaKg : null,
      sacrificio: hora(a.sacrificio.at),
      tipo: a.canal.tipoAnimal ? CANAL_ANIMAL_TIPO_LABEL[a.canal.tipoAnimal] : '—',
      canal: a.canal.canalTipo ? CANAL_TIPO_LABEL[a.canal.canalTipo] : '—',
      piezas: pz.length ? pz.map((p) => `${PIEZA_LABEL[p.pieza]} ${num(p.pesoKg)}`).join(' / ') : '—',
      piel: a.piel.kg,
      rnd: a.rendimiento,
      cava: unicos(pz.map((p) => p.cava)),
      destino: unicos(pz.map((p) => p.destino)),
      observacion: unicos([...pz.map((p) => p.observaciones), a.pie?.observaciones]),
      despacho: pz.length ? (pz.some((p) => p.despacho) ? unicos(pz.map((p) => p.despacho)) : 'En inventario') : '—',
    };
  });
}

export type FilaAnimal = ReturnType<typeof filasAnimales>[number];

export interface ColumnaAnimal {
  titulo: string;
  key: keyof FilaAnimal;
  /** kg = 1 decimal con separador de miles; pct = porcentaje con 1 decimal. */
  tipo?: 'kg' | 'pct';
  resaltar?: boolean;
}

/** Columnas de "Proceso por animal", en el orden del proceso. */
export const COLUMNAS_ANIMALES: ColumnaAnimal[] = [
  { titulo: 'No.', key: 'no' },
  { titulo: 'ANIMAL', key: 'animal', resaltar: true },
  { titulo: 'TURNO', key: 'turno' },
  { titulo: 'PESO CAMIÓN(kg)', key: 'pesoCamion', tipo: 'kg' },
  { titulo: 'CORRAL', key: 'corral' },
  { titulo: 'SEXO', key: 'sexo' },
  { titulo: 'PESO INICIAL(kg)', key: 'pepIni', tipo: 'kg' },
  { titulo: 'PESO EN PIE(kg)', key: 'pep', tipo: 'kg' },
  { titulo: 'MERMA(kg)', key: 'mermaPie', tipo: 'kg' },
  { titulo: 'SACRIFICIO', key: 'sacrificio' },
  { titulo: 'TIPO', key: 'tipo' },
  { titulo: 'CANAL', key: 'canal' },
  { titulo: 'PIEZAS(kg)', key: 'piezas' },
  { titulo: 'PIEL(kg)', key: 'piel', tipo: 'kg' },
  { titulo: 'RND(%)', key: 'rnd', tipo: 'pct', resaltar: true },
  { titulo: 'CAVA', key: 'cava' },
  { titulo: 'DESTINO', key: 'destino' },
  { titulo: 'OBSERVACIÓN', key: 'observacion' },
  { titulo: 'DESPACHO', key: 'despacho' },
];

/** Texto de una celda (pantalla y PDF). */
export function textoCelda(f: FilaAnimal, c: ColumnaAnimal) {
  const v = f[c.key];
  return c.tipo ? num(v as number | null) : String(v ?? '—');
}

export const COLUMNAS_SUBPRODUCTOS = ['CÓDIGO', 'PRODUCTO', 'UNIDAD', 'ANIMALES', 'UNIDADES', 'KG'] as const;

export function filasSubproductos(d: DetalleProceso) {
  return d.subproductos.map((s) => ({
    codigo: s.codigo,
    producto: s.producto,
    unidad: s.unidad === 'kg' ? 'Kg' : 'Unidad',
    animales: s.animales,
    unidades: s.unidad === 'kg' ? null : s.unidades,
    kg: s.unidad === 'kg' ? s.kg : null,
  }));
}

export const LEYENDA_PROCESO =
  'PEP (Peso en pie, actual tras repesajes), PEP INI. (pesaje inicial), PEC (Peso en caliente), RND (Rendimiento = PEC ÷ PEP).';

function ahora() {
  return new Date().toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
}
const nombreArchivo = (d: DetalleProceso) => `infoproceso-${formatOB(d.orden.reference)}-${d.orden.date}`;

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

/** Informe de proceso general en PDF (A4 horizontal). */
export async function descargarProcesoPdf(d: DetalleProceso, operario: string) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 8;
  const contentW = pageW - margin * 2;

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
    margin: { left: margin, right: margin, bottom: 14 },
    theme: 'grid' as const,
    styles: { lineColor: INK, lineWidth: 0.2, textColor: TEXT, fontSize: 7.5, cellPadding: 1, halign: 'center' as const },
  };
  const lbl = { fontStyle: 'bold' as const, fillColor: GRAY };
  const head = { fillColor: GRAY, textColor: TEXT, fontStyle: 'bold' as const, lineColor: INK, lineWidth: 0.2 };

  autoTable(doc, {
    ...base,
    startY: margin + 22,
    styles: { ...base.styles, fontSize: 12, fontStyle: 'bold' },
    body: [[`INFORME DE PROCESO GENERAL OS No. ${formatOB(d.orden.reference)}`]],
  });

  // Tarjetas de estadísticas (las mismas de la pantalla), en una fila.
  const tarjetas = totalesResumen(d);
  const gap = 2;
  const cardW = (contentW - gap * (tarjetas.length - 1)) / tarjetas.length;
  const cardH = 14;
  const cardY = finalY(doc) + 3;
  tarjetas.forEach(([k, v], i) => {
    const x = margin + i * (cardW + gap);
    doc.setFillColor(...GRAY);
    doc.setDrawColor(209, 213, 219);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, cardY, cardW, cardH, 1.5, 1.5, 'FD');
    doc.setTextColor(107, 114, 128);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.text(k.toUpperCase(), x + 2.5, cardY + 4.5, { maxWidth: cardW - 5 });
    doc.setTextColor(...TEXT);
    doc.setFontSize(12);
    doc.text(v, x + 2.5, cardY + 11);
  });

  // Bloques clave/valor en tres columnas (guía, peso en pie, orden).
  const bloques = bloquesResumen(d);
  const colW = contentW / 3;
  const startY = cardY + cardH + 3;
  let maxY = startY;
  bloques.forEach((b, i) => {
    autoTable(doc, {
      ...base,
      startY,
      margin: { left: margin + colW * i, right: pageW - margin - colW * (i + 1) + (i < 2 ? 1.5 : 0) },
      tableWidth: colW - (i < 2 ? 1.5 : 0),
      styles: { ...base.styles, halign: 'left', fontSize: 7 },
      columnStyles: { 0: { cellWidth: 30, ...lbl } },
      head: [[{ content: b.titulo, colSpan: 2, styles: { halign: 'center' } }]],
      headStyles: head,
      body: b.datos,
    });
    maxY = Math.max(maxY, finalY(doc));
  });

  // Personal que intervino.
  autoTable(doc, {
    ...base,
    startY: maxY + 3,
    head: [personal(d).map(([k]) => `PERSONAL ${k.toUpperCase()}`)],
    headStyles: head,
    styles: { ...base.styles, fontSize: 7 },
    body: [personal(d).map(([, v]) => v)],
  });

  // Proceso por animal.
  autoTable(doc, {
    ...base,
    startY: finalY(doc) + 4,
    head: [
      [{ content: 'PROCESO POR ANIMAL', colSpan: COLUMNAS_ANIMALES.length, styles: { halign: 'center' } }],
      COLUMNAS_ANIMALES.map((c) => c.titulo),
    ],
    headStyles: { ...head, fontSize: 6.5 },
    styles: { ...base.styles, fontSize: 6.5, cellPadding: 0.8 },
    columnStyles: Object.fromEntries(
      COLUMNAS_ANIMALES.map((c, i) => [
        i,
        c.key === 'piezas'
          ? { cellWidth: 24 }
          : c.key === 'observacion'
            ? { halign: 'left' as const }
            : c.tipo
              ? { halign: 'right' as const, fontStyle: c.resaltar ? ('bold' as const) : ('normal' as const) }
              : {},
      ]),
    ),
    body: filasAnimales(d).map((f) => COLUMNAS_ANIMALES.map((c) => textoCelda(f, c))),
  });

  // Subproductos.
  const subs = filasSubproductos(d);
  autoTable(doc, {
    ...base,
    startY: finalY(doc) + 4,
    head: [
      [{ content: 'SUBPRODUCTOS', colSpan: COLUMNAS_SUBPRODUCTOS.length, styles: { halign: 'center' } }],
      [...COLUMNAS_SUBPRODUCTOS],
    ],
    headStyles: head,
    columnStyles: { 1: { halign: 'left' } },
    body: subs.length
      ? subs.map((s) => [s.codigo, s.producto, s.unidad, s.animales, s.unidades ?? '—', num(s.kg)])
      : [[{ content: 'No hay subproductos registrados en esta orden.', colSpan: COLUMNAS_SUBPRODUCTOS.length }]],
  });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text(LEYENDA_PROCESO, margin, Math.min(finalY(doc) + 5, pageH - 12));

  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.text('Elaboró: © Grupo Santacruz, 2026', margin, pageH - 5);
    doc.text(`Operario: ${operario.toUpperCase()} | ${ahora()} | Página ${i} de ${paginas}`, pageW - margin, pageH - 5, { align: 'right' });
  }

  doc.save(`${nombreArchivo(d)}.pdf`);
}

/** Informe de proceso general en Excel: hojas Resumen, Animales y Subproductos. */
export async function descargarProcesoExcel(d: DetalleProceso, operario: string) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const borde = { style: 'thin' as const };
  const gris = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF3F4F6' } };
  const marco = { top: borde, left: borde, bottom: borde, right: borde };

  const logo = await fetch(logoUrl).then((r) => r.arrayBuffer()).catch(() => null);
  const logoId = logo ? wb.addImage({ buffer: logo, extension: 'png' }) : null;

  /** Logo (filas 1–4) + datos de la empresa + título en la fila 5. Devuelve la fila siguiente libre. */
  function encabezado(ws: import('exceljs').Worksheet, primeraTexto: string, ultimaCol: string) {
    for (let r = 1; r <= 4; r++) ws.getRow(r).height = 16;
    if (logoId != null) ws.addImage(logoId, { tl: { col: 0.15, row: 0.2 }, ext: { width: 105, height: 62 } });
    [
      'AGROPECUARIA SANTA CRUZ LTDA',
      'NIT. 830.505.537-2',
      'KM 3 VÍA ORIENTAL TEL. 3766701',
      'MALAMBO - ATLÁNTICO',
    ].forEach((t, i) => {
      ws.mergeCells(`${primeraTexto}${i + 1}:${ultimaCol}${i + 1}`);
      const c = ws.getCell(`${primeraTexto}${i + 1}`);
      c.value = t;
      c.font = { bold: true, size: i === 0 ? 11 : 10 };
      c.alignment = { horizontal: 'center' };
    });
    ws.mergeCells(`A5:${ultimaCol}5`);
    ws.getCell('A5').value = `INFORME DE PROCESO GENERAL OS No. ${formatOB(d.orden.reference)}`;
    ws.getCell('A5').font = { bold: true, size: 13 };
    ws.getCell('A5').alignment = { horizontal: 'center' };
    return 7;
  }

  function tabla(ws: import('exceljs').Worksheet, fila: number, cabecera: readonly string[], filas: (string | number | null)[][], formatos: Record<number, string> = {}) {
    const h = ws.getRow(fila);
    cabecera.forEach((c, i) => {
      const cell = h.getCell(i + 1);
      cell.value = c;
      cell.font = { bold: true };
      cell.fill = gris;
      cell.border = marco;
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });
    filas.forEach((f, r) => {
      const row = ws.getRow(fila + 1 + r);
      f.forEach((v, i) => {
        const cell = row.getCell(i + 1);
        cell.value = v ?? '—';
        cell.border = marco;
        cell.alignment = { vertical: 'middle', wrapText: true };
        if (formatos[i] && typeof v === 'number') cell.numFmt = formatos[i];
      });
    });
    return fila + 1 + filas.length;
  }

  // Hoja 1: resumen.
  const res = wb.addWorksheet('Resumen');
  [32, 48].forEach((w, i) => (res.getColumn(i + 1).width = w));
  let fila = encabezado(res, 'B', 'B');
  for (const b of [...bloquesResumen(d), { titulo: 'TOTALES', datos: totalesResumen(d) }, { titulo: 'PERSONAL QUE INTERVINO', datos: personal(d) }]) {
    res.mergeCells(`A${fila}:B${fila}`);
    const t = res.getCell(`A${fila}`);
    t.value = b.titulo;
    t.font = { bold: true };
    t.fill = gris;
    t.border = marco;
    t.alignment = { horizontal: 'center' };
    fila++;
    for (const [k, v] of b.datos) {
      res.getCell(`A${fila}`).value = k;
      res.getCell(`A${fila}`).font = { bold: true };
      res.getCell(`B${fila}`).value = v;
      res.getCell(`A${fila}`).border = marco;
      res.getCell(`B${fila}`).border = marco;
      res.getCell(`B${fila}`).alignment = { wrapText: true };
      fila++;
    }
    fila++;
  }
  res.getCell(`A${fila}`).value = `Operario: ${operario.toUpperCase()} | ${ahora()}`;
  res.getCell(`A${fila}`).font = { bold: true, size: 9 };

  // Hoja 2: proceso por animal.
  const an = wb.addWorksheet('Proceso por animal', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  });
  const anchos: Partial<Record<keyof FilaAnimal, number>> = {
    no: 6, animal: 8, turno: 7, corral: 10, sexo: 10, sacrificio: 11, tipo: 10, canal: 16,
    piezas: 24, cava: 12, destino: 16, observacion: 24, despacho: 18,
  };
  COLUMNAS_ANIMALES.forEach((c, i) => (an.getColumn(i + 1).width = anchos[c.key] ?? 12));
  const ultimaCol = String.fromCharCode(64 + COLUMNAS_ANIMALES.length);
  const finAn = tabla(
    an,
    encabezado(an, 'C', ultimaCol),
    COLUMNAS_ANIMALES.map((c) => c.titulo),
    filasAnimales(d).map((f) =>
      COLUMNAS_ANIMALES.map((c) => {
        const v = f[c.key];
        return typeof v === 'number' ? Math.round(v * 100) / 100 : (v ?? null);
      }),
    ),
    Object.fromEntries(
      COLUMNAS_ANIMALES.map((c, i) => [i, c.tipo === 'pct' ? '0.0' : c.tipo === 'kg' ? '#,##0.0' : '']).filter(([, f]) => f),
    ),
  );
  an.getCell(`A${finAn + 1}`).value = LEYENDA_PROCESO;
  an.getCell(`A${finAn + 1}`).font = { bold: true, size: 9 };

  // Hoja 3: subproductos.
  const sp = wb.addWorksheet('Subproductos');
  [10, 36, 10, 11, 11, 11].forEach((w, i) => (sp.getColumn(i + 1).width = w));
  const filaSp = encabezado(sp, 'C', 'F');
  const subs = filasSubproductos(d);
  if (subs.length) {
    tabla(sp, filaSp, COLUMNAS_SUBPRODUCTOS, subs.map((s) => [s.codigo, s.producto, s.unidad, s.animales, s.unidades, s.kg]), { 5: '#,##0.00' });
  } else {
    sp.getCell(`A${filaSp}`).value = 'No hay subproductos registrados en esta orden.';
  }

  const buffer = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = `${nombreArchivo(d)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
