import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { codigoBarras } from '../canal-caliente/canal-presinto-print';
import { CANAL_ANIMAL_TIPO_LABEL } from '../canal-caliente/api';
import { formatOB } from '../registrar/orden-beneficio-api';
import type { DetalleCanalCaliente, DetallePieza } from './api';

/** Rangos que disparan alerta en el informe interno. */
export const RANGO_RENDIMIENTO = { min: 52, max: 60 };
export const DIF_MEDIAS_MAX_KG = 4;

export interface MediaInterna {
  barcode: string;
  pesoKg: number;
}

export interface AnimalInterno {
  turno: number;
  tipo: string;
  vivoKg: number | null;
  izq: MediaInterna | null;
  der: MediaInterna | null;
  canalKg: number;
  rendimiento: number | null;
  difKg: number | null;
  cava: string;
  hora: string;
  operario: string;
  alertas: string[];
}

const iniciales = (n: string | null) =>
  n
    ? n
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((x) => x[0])
        .join('.') + '.'
    : '—';

const horaCorta = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' });

/** Agrupa las piezas por animal: una fila con sus dos medias (o la canal completa). */
export function animalesInternos(d: DetalleCanalCaliente): AnimalInterno[] {
  const grupos = new Map<number, DetallePieza[]>();
  for (const p of d.piezas) {
    const t = p.turno ?? p.sequence;
    grupos.set(t, [...(grupos.get(t) ?? []), p]);
  }
  return [...grupos.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([turno, ps]) => {
      const media = (p: DetallePieza | undefined): MediaInterna | null =>
        p
          ? {
              barcode: p.canalTipo
                ? codigoBarras({ lote: d.reference, turno, canalTipo: p.canalTipo, pieza: p.pieza })
                : '—',
              pesoKg: p.pesoKg,
            }
          : null;
      const completa = ps.find((p) => p.pieza === 'canal');
      const izq = media(completa ?? ps.find((p) => p.pieza === 'cizq'));
      const der = completa ? null : media(ps.find((p) => p.pieza === 'cder'));
      const canalKg = ps.reduce((s, p) => s + p.pesoKg, 0);
      const vivoKg = ps[0].vivoKg;
      const rendimiento = vivoKg ? (canalKg / vivoKg) * 100 : null;
      const difKg = izq && der ? Math.abs(izq.pesoKg - der.pesoKg) : null;
      const alertas: string[] = [];
      if (rendimiento != null && rendimiento < RANGO_RENDIMIENTO.min) alertas.push('Rendimiento bajo');
      if (rendimiento != null && rendimiento > RANGO_RENDIMIENTO.max) alertas.push('Rendimiento alto');
      if (difKg != null && difKg > DIF_MEDIAS_MAX_KG) alertas.push('Medias desiguales');
      if (!completa && (!izq || !der)) alertas.push('Falta una media');
      const primera = [...ps].sort((a, b) => a.weighedAt.localeCompare(b.weighedAt))[0];
      return {
        turno,
        tipo: ps[0].canalAnimalTipo ? CANAL_ANIMAL_TIPO_LABEL[ps[0].canalAnimalTipo].toUpperCase() : '—',
        vivoKg,
        izq,
        der,
        canalKg,
        rendimiento,
        difKg,
        cava: [...new Set(ps.map((p) => p.cava ?? '—'))].join(', '),
        hora: horaCorta(primera.weighedAt),
        operario: iniciales(primera.operario),
        alertas,
      };
    });
}

export function resumenInterno(d: DetalleCanalCaliente) {
  const animales = animalesInternos(d);
  const canal = animales.reduce((s, a) => s + a.canalKg, 0);
  const vivo = animales.reduce((s, a) => s + (a.vivoKg ?? 0), 0);
  const conVivo = animales.filter((a) => a.vivoKg);
  const rendimiento = vivo ? (conVivo.reduce((s, a) => s + a.canalKg, 0) / vivo) * 100 : null;
  const prom = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  const izqs = animales.flatMap((a) => (a.izq && a.der ? [a.izq.pesoKg] : []));
  const ders = animales.flatMap((a) => (a.der ? [a.der.pesoKg] : []));

  const porTipo = new Map<string, { n: number; canal: number; vivo: number }>();
  for (const a of animales) {
    const g = porTipo.get(a.tipo) ?? { n: 0, canal: 0, vivo: 0 };
    g.n++;
    if (a.vivoKg) {
      g.canal += a.canalKg;
      g.vivo += a.vivoKg;
    }
    porTipo.set(a.tipo, g);
  }
  const porCava = new Map<string, { medias: number; kg: number }>();
  for (const p of d.piezas) {
    const k = p.cava ?? 'SIN CAVA';
    const g = porCava.get(k) ?? { medias: 0, kg: 0 };
    g.medias++;
    g.kg += p.pesoKg;
    porCava.set(k, g);
  }
  const conRend = animales.filter((a) => a.rendimiento != null);
  const mejor = conRend.reduce<AnimalInterno | null>((m, a) => (!m || a.rendimiento! > m.rendimiento! ? a : m), null);
  const peor = conRend.reduce<AnimalInterno | null>((m, a) => (!m || a.rendimiento! < m.rendimiento! ? a : m), null);
  return {
    animales,
    piezas: d.piezas.length,
    canal,
    vivo,
    rendimiento,
    promCanal: prom(animales.map((a) => a.canalKg)),
    promIzq: prom(izqs),
    promDer: prom(ders),
    porTipo: [...porTipo.entries()].map(([tipo, g]) => ({
      tipo,
      n: g.n,
      rendimiento: g.vivo ? (g.canal / g.vivo) * 100 : null,
    })),
    porCava: [...porCava.entries()].map(([cava, g]) => ({ cava, ...g })),
    mejor,
    peor,
    conAlerta: animales.filter((a) => a.alertas.length).length,
  };
}

const kg = (n: number, dec = 1) => n.toLocaleString('es-CO', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const pct = (n: number | null) => (n == null ? '—' : `${kg(n, 1)} %`);
const hora = (iso: string | null) => (iso ? horaCorta(iso) : '—');
const fecha = (iso: string | null, alt: string) =>
  iso ? new Date(iso).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' }) : alt;

export function encabezadoInterno(d: DetalleCanalCaliente) {
  return {
    titulo: `Reporte interno · Canal caliente · Orden de beneficio ${formatOB(d.reference)}`,
    sacrificio: `Sacrificio ${fecha(d.sacrificioDesde, d.date)} ${hora(d.sacrificioDesde)}–${hora(d.sacrificioHasta)}`,
    lote: [
      `Cliente ${d.cliente}`,
      d.guias.length ? `Guías ${d.guias.join(', ')}` : null,
      d.lotes.length ? `Lote ${d.lotes.join(', ')}` : null,
      d.procedencias.length ? `Procedencia ${d.procedencias.join(', ')}` : null,
      d.proveedores.length ? `Proveedor ${d.proveedores.join(', ')}` : null,
    ]
      .filter(Boolean)
      .join('  ·  '),
  };
}

function filaTexto(a: AnimalInterno) {
  return [
    a.turno,
    a.tipo,
    a.vivoKg != null ? kg(a.vivoKg) : '—',
    a.izq?.barcode ?? '—',
    a.izq ? kg(a.izq.pesoKg) : '—',
    a.der?.barcode ?? '—',
    a.der ? kg(a.der.pesoKg) : '—',
    kg(a.canalKg),
    `${a.alertas.length ? '! ' : ''}${pct(a.rendimiento)}`,
    a.difKg != null ? kg(a.difKg) : '—',
    a.cava,
    `${a.hora} ${a.operario}`,
  ];
}

const COLUMNAS = ['Tur.', 'Tipo', 'Vivo kg', 'Izq. (con cola)', 'kg', 'Der. (sin cola)', 'kg', 'Canal kg', 'Rend.', 'Dif. I-D', 'Cava', 'Hora / Op.'];

/** PDF horizontal del informe interno. */
export async function descargarInternoPdf(d: DetalleCanalCaliente, usuario: string) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const m = 10;
  const enc = encabezadoInterno(d);
  const r = resumenInterno(d);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(enc.titulo.toUpperCase(), m, m + 4);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(enc.sacrificio, pageW - m, m + 4, { align: 'right' });
  doc.text(enc.lote, m, m + 10, { maxWidth: pageW - 2 * m });

  autoTable(doc, {
    startY: m + 15,
    margin: { left: m, right: m },
    theme: 'grid',
    head: [COLUMNAS],
    body: r.animales.map(filaTexto),
    styles: { fontSize: 8, cellPadding: 1.2, lineColor: [200, 200, 200], lineWidth: 0.2, textColor: [20, 20, 20] },
    headStyles: { fillColor: [235, 237, 240], textColor: [20, 20, 20], fontStyle: 'bold' },
    columnStyles: { 2: { halign: 'right' }, 4: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right', fontStyle: 'bold' }, 8: { halign: 'right' }, 9: { halign: 'right' } },
    didParseCell: (c) => {
      if (c.section === 'body' && r.animales[c.row.index]?.alertas.length && (c.column.index === 8 || c.column.index === 9)) {
        c.cell.styles.fontStyle = 'bold';
      }
    },
  });

  const y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  const lineas = [
    `Animales ${r.animales.length} · Medias ${r.piezas} · Vivo ${kg(r.vivo)} kg · Canal ${kg(r.canal)} kg · Rendimiento ${pct(r.rendimiento)}`,
    `Promedio canal ${kg(r.promCanal)} kg · Media con cola ${kg(r.promIzq)} kg · Media sin cola ${kg(r.promDer)} kg`,
    `Por tipo: ${r.porTipo.map((t) => `${t.tipo} ${t.n} → ${pct(t.rendimiento)}`).join('   ')}`,
    `Por cava: ${r.porCava.map((c) => `${c.cava} → ${c.medias} medias · ${kg(c.kg)} kg`).join('   ')}`,
    r.mejor && r.peor ? `Mejor: turno ${r.mejor.turno} (${pct(r.mejor.rendimiento)}) · Más bajo: turno ${r.peor.turno} (${pct(r.peor.rendimiento)})` : '',
    r.conAlerta ? `! ${r.conAlerta} animal(es) con alerta (rendimiento fuera de ${RANGO_RENDIMIENTO.min}–${RANGO_RENDIMIENTO.max} % o medias con más de ${DIF_MEDIAS_MAX_KG} kg de diferencia)` : 'Sin alertas.',
  ].filter(Boolean);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('RESUMEN DEL LOTE', m, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  lineas.forEach((l, i) => doc.text(l, m, y + 5 + i * 4.6, { maxWidth: pageW - 2 * m }));

  doc.setFontSize(7.5);
  doc.text(`Generado por ${usuario.toUpperCase()} · ${new Date().toLocaleString('es-CO')}`, pageW - m, pageH - 6, { align: 'right' });
  doc.save(`canal-caliente-interno-${formatOB(d.reference)}.pdf`);
}

/** Excel del informe interno: hoja de animales (filtrable) y hoja de resumen. */
export async function descargarInternoExcel(d: DetalleCanalCaliente) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const enc = encabezadoInterno(d);
  const r = resumenInterno(d);

  const ws = wb.addWorksheet('Animales', { views: [{ state: 'frozen', ySplit: 4 }] });
  ws.getCell('A1').value = enc.titulo;
  ws.getCell('A1').font = { bold: true, size: 13 };
  ws.getCell('A2').value = `${enc.sacrificio}  ·  ${enc.lote}`;
  const cols = [
    ['Turno', 8], ['Tipo', 12], ['Vivo kg', 11], ['Barcode izq.', 13], ['Izq. kg', 10], ['Barcode der.', 13], ['Der. kg', 10],
    ['Canal kg', 11], ['Rendimiento %', 14], ['Dif. I-D kg', 11], ['Cava', 12], ['Hora', 8], ['Operario', 10], ['Alertas', 26],
  ] as const;
  cols.forEach(([, w], i) => (ws.getColumn(i + 1).width = w));
  const head = ws.getRow(4);
  cols.forEach(([t], i) => {
    const c = head.getCell(i + 1);
    c.value = t;
    c.font = { bold: true };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEBEDF0' } };
  });
  r.animales.forEach((a, i) => {
    const row = ws.getRow(5 + i);
    row.values = [
      a.turno, a.tipo, a.vivoKg, a.izq?.barcode ?? null, a.izq?.pesoKg ?? null, a.der?.barcode ?? null, a.der?.pesoKg ?? null,
      Number(a.canalKg.toFixed(2)), a.rendimiento != null ? Number(a.rendimiento.toFixed(2)) : null,
      a.difKg != null ? Number(a.difKg.toFixed(2)) : null, a.cava, a.hora, a.operario, a.alertas.join(', '),
    ];
    [3, 5, 7, 8, 10].forEach((c) => (row.getCell(c).numFmt = '#,##0.0'));
    row.getCell(9).numFmt = '0.0';
    if (a.alertas.length) row.getCell(9).font = { bold: true };
  });
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + r.animales.length, column: cols.length } };

  const rs = wb.addWorksheet('Resumen');
  rs.getColumn(1).width = 30;
  rs.getColumn(2).width = 18;
  rs.getColumn(3).width = 18;
  const filasRes: (string | number | null)[][] = [
    [enc.titulo],
    [],
    ['Animales', r.animales.length],
    ['Medias', r.piezas],
    ['Peso vivo (kg)', Number(r.vivo.toFixed(1))],
    ['Canal caliente (kg)', Number(r.canal.toFixed(1))],
    ['Rendimiento %', r.rendimiento != null ? Number(r.rendimiento.toFixed(2)) : null],
    ['Promedio canal (kg)', Number(r.promCanal.toFixed(1))],
    ['Promedio media con cola (kg)', Number(r.promIzq.toFixed(1))],
    ['Promedio media sin cola (kg)', Number(r.promDer.toFixed(1))],
    ['Animales con alerta', r.conAlerta],
    [],
    ['Tipo', 'Animales', 'Rendimiento %'],
    ...r.porTipo.map((t) => [t.tipo, t.n, t.rendimiento != null ? Number(t.rendimiento.toFixed(2)) : null]),
    [],
    ['Cava', 'Medias', 'Kg'],
    ...r.porCava.map((c) => [c.cava, c.medias, Number(c.kg.toFixed(1))]),
  ];
  filasRes.forEach((f) => rs.addRow(f));
  rs.getCell('A1').font = { bold: true, size: 13 };
  [13, 16 + r.porTipo.length].forEach((n) => (rs.getRow(n).font = { bold: true }));

  const buffer = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `canal-caliente-interno-${formatOB(d.reference)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
