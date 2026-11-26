import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import logoUrl from '@/assets/logo-santacruz.png';
import { formatGM, type Remision, type VistaRemision } from './api';

const INK: [number, number, number] = [31, 41, 55];
const GRAY: [number, number, number] = [243, 244, 246];
const TEXT: [number, number, number] = [17, 17, 17];

const TIPO: Record<Remision['tipo'], string> = {
  caliente: 'DESPACHO CALIENTE',
  frio: 'DESPACHO FRÍO',
  posta: 'DESPACHO POSTA',
};

const kg = (n: number) =>
  n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const v = (s: string | null | undefined) => (s && s.trim()) || 'N/A';

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

const fechaCO = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
const horaCO = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' });

/**
 * Guía de transporte nacional de carne (remisión) de una orden de despacho de canales.
 * Archivo: guiatransporte-GM{n}-DC{n}.pdf
 */
async function generarGuiaPdf(r: Remision, operario: string, vista: VistaRemision = 'cliente') {
  const interna = vista === 'interna';
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 10;
  const contentW = pageW - margin * 2;
  const gm = r.guia ? formatGM(r.guia.numero) : 'SIN GUÍA';
  const d = r.destino;

  // Encabezado: logo + empresa.
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
  doc.setFontSize(r.codigo.length > 10 ? 11 : 13);
  doc.text(r.codigo, pageW - margin - 4, headerY + 11, { align: 'right' });
  if (interna) {
    doc.setFontSize(7.5);
    doc.text('VISTA INTERNA', pageW - margin - 4, headerY + 17, { align: 'right' });
  }

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
      valign: 'middle' as const,
    },
  };
  const lbl = { fontStyle: 'bold' as const, fillColor: GRAY };
  const seccion = (t: string) => [
    { content: t, colSpan: 4, styles: { ...lbl, fontSize: 10, halign: 'left' as const } },
  ];
  const col4 = contentW / 4;
  const cols4 = { 0: { cellWidth: col4 }, 1: { cellWidth: col4 }, 2: { cellWidth: col4 }, 3: { cellWidth: col4 } };

  autoTable(doc, {
    ...base,
    startY: headerY + headerH,
    styles: { ...base.styles, fontSize: 10.5, fontStyle: 'bold' },
    body: [
      [
        'GUÍA DE TRANSPORTE NACIONAL DE CARNE EN CANAL BOVINO, DESHUESADA Y SUBPRODUCTOS COMESTIBLES',
      ],
    ],
  });

  autoTable(doc, {
    ...base,
    startY: finalY(doc),
    columnStyles: cols4,
    body: [
      [
        { content: 'AUTORIZACIÓN SANITARIA', styles: lbl },
        { content: 'TIPO DE CONSUMO', styles: lbl },
        { content: 'FECHA Y HORA DE EXPEDICIÓN', styles: lbl },
        { content: 'GUÍA No.', styles: lbl },
      ],
      [
        `COD INVIMA ${v(r.planta.invima)}`,
        'ÚNICAMENTE PARA CONSUMO NACIONAL',
        `${fechaCO(r.cerradaAt)} ${horaCO(r.cerradaAt)}`,
        { content: gm, styles: { fontStyle: 'bold', fontSize: 11 } },
      ],
    ],
  });

  // 1. Establecimiento de destino.
  autoTable(doc, {
    ...base,
    startY: finalY(doc) + 4,
    columnStyles: cols4,
    body: [
      seccion('1. ESTABLECIMIENTO DE DESTINO'),
      [
        { content: 'RAZÓN SOCIAL', styles: lbl },
        { content: d.razonSocial, colSpan: 2, styles: { fontStyle: 'bold' } },
        { content: `NIT ${v(d.nit)}` },
      ],
      ...(d.tienda
        ? [
            [
              { content: 'TIENDA', styles: lbl },
              {
                content: [d.tienda.codigo, d.tienda.nombre].filter(Boolean).join(' - ') || 'N/A',
                colSpan: 2,
                styles: { fontStyle: 'bold' as const },
              },
              d.tienda.ocNumero ? `OC ${d.tienda.ocNumero}` : 'N/A',
            ],
          ]
        : []),
      [
        { content: 'DIRECCIÓN', styles: lbl },
        { content: v(d.direccion), colSpan: 3 },
      ],
      [
        { content: 'MUNICIPIO / DEPTO.', styles: lbl },
        [d.municipio, d.departamento].filter(Boolean).join(' - ') || 'N/A',
        { content: 'TELÉFONO', styles: lbl },
        v(d.telefono),
      ],
      [
        { content: 'PROCESADO PARA', styles: lbl },
        {
          content: r.cliente.nit ? `${r.cliente.nit} - ${r.cliente.razonSocial}` : r.cliente.razonSocial,
          colSpan: 2,
        },
        TIPO[r.tipo],
      ],
      [
        { content: 'FECHA SACRIFICIO', styles: lbl },
        { content: 'FECHA DESPACHO', styles: lbl },
        { content: 'HORA DESPACHO', styles: lbl },
        { content: 'ORDEN DE DESPACHO', styles: lbl },
      ],
      [
        r.fechasSacrificio.join(', ') || 'N/A',
        fechaCO(r.cerradaAt),
        horaCO(r.cerradaAt),
        r.codigo,
      ],
    ],
  });

  // 2. Condiciones de producto (cliente: por producto y lote; interna: por código de barras).
  const totUnds = r.items.reduce((s, i) => s + i.unds, 0);
  const totKg = r.items.reduce((s, i) => s + i.kg, 0);
  const dictamen = (cols: number) => [
    { content: 'DICTAMEN: APROBADOS', colSpan: cols, styles: { fontStyle: 'bold' as const, halign: 'left' as const } },
  ];
  if (interna) {
    const detalle = r.detalle ?? [];
    autoTable(doc, {
      ...base,
      startY: finalY(doc) + 4,
      styles: { ...base.styles, fontSize: 8.5 },
      headStyles: { fillColor: GRAY, textColor: TEXT, fontStyle: 'bold', lineColor: INK, lineWidth: 0.25 },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 30 },
        2: { cellWidth: 22 },
        3: { halign: 'left' },
        4: { cellWidth: 24 },
        5: { cellWidth: 14 },
        6: { cellWidth: 22 },
      },
      head: [
        [
          {
            content: `2. CONDICIONES DE PRODUCTO · DETALLE POR CÓDIGO DE BARRAS (${detalle.length} registro${detalle.length === 1 ? '' : 's'})`,
            colSpan: 7,
            styles: { halign: 'left', fontSize: 10 },
          },
        ],
        ['ITEM', 'CÓDIGO DE BARRAS', 'TIPO', 'PRODUCTO', 'LOTE', 'UND', 'KG'],
      ],
      body: [
        ...detalle.map((i, n) => [String(n + 1), i.codigo, i.tipoCodigo, i.producto, i.lote, String(i.unds), kg(i.kg)]),
        [
          { content: 'TOTAL', colSpan: 5, styles: { ...lbl, halign: 'right' as const } },
          { content: String(totUnds), styles: lbl },
          { content: kg(totKg), styles: lbl },
        ],
        dictamen(7),
      ],
    });
  } else {
  autoTable(doc, {
    ...base,
    startY: finalY(doc) + 4,
    headStyles: { fillColor: GRAY, textColor: TEXT, fontStyle: 'bold', lineColor: INK, lineWidth: 0.25 },
    columnStyles: {
      0: { cellWidth: 12 },
      1: { halign: 'left' },
      2: { cellWidth: 30 },
      3: { cellWidth: 18 },
      4: { cellWidth: 22 },
      5: { cellWidth: 28 },
    },
    head: [
      [{ content: '2. CONDICIONES DE PRODUCTO', colSpan: 6, styles: { halign: 'left', fontSize: 10 } }],
      ['ITEM', 'PRODUCTO', 'LOTE', 'T °C', 'CANT. (und)', 'CANT. (kg)'],
    ],
    body: [
      ...r.items.map((i, n) => [String(n + 1), i.producto, i.lote, '', String(i.unds), kg(i.kg)]),
      [
        { content: 'TOTAL', colSpan: 4, styles: { ...lbl, halign: 'right' as const } },
        { content: String(totUnds), styles: lbl },
        { content: kg(totKg), styles: lbl },
      ],
      dictamen(6),
    ],
  });
  }

  // 3. Vehículo.
  const g = r.guia;
  autoTable(doc, {
    ...base,
    startY: finalY(doc) + 4,
    columnStyles: cols4,
    body: [
      seccion('3. VEHÍCULO TRANSPORTADOR'),
      [
        { content: 'TIPO DE VEHÍCULO', styles: lbl },
        v(g?.tipoVehiculo),
        { content: 'PLACA', styles: lbl },
        { content: v(g?.placa), styles: { fontStyle: 'bold' } },
      ],
      [
        { content: 'CONDUCTOR', styles: lbl },
        v(g?.conductor),
        { content: 'CÉDULA', styles: lbl },
        v(g?.cedula),
      ],
      [
        { content: 'SISTEMA DE CONSERVACIÓN', styles: lbl },
        { content: '', colSpan: 3 },
      ],
      [
        { content: 'OBSERVACIONES', styles: lbl },
        { content: v(g?.observacion), colSpan: 3, styles: { halign: 'left' } },
      ],
    ],
  });

  // 4. Firmas.
  autoTable(doc, {
    ...base,
    startY: finalY(doc) + 4,
    columnStyles: { 0: { cellWidth: contentW / 2 }, 1: { cellWidth: contentW / 2 } },
    body: [
      [
        { content: '4. RESPONSABLES', colSpan: 2, styles: { ...lbl, fontSize: 10, halign: 'left' as const } },
      ],
      [
        { content: '', styles: { minCellHeight: 20 } },
        { content: '', styles: { minCellHeight: 20 } },
      ],
      [
        { content: `DESPACHA: ${r.despachador.toUpperCase()}`, styles: lbl },
        { content: 'RECIBE (NOMBRE, FIRMA Y CÉDULA)', styles: lbl },
      ],
    ],
  });

  // Nota legal.
  const nota =
    'La planta de beneficio es responsable de la veracidad de la información consignada en esta guía. ' +
    'Cualquier alteración, enmendadura o uso indebido de este documento será sancionado conforme a la ' +
    'Ley 906 de 2004 (Código de Procedimiento Penal) y demás normas sanitarias vigentes. ' +
    'Esta guía debe acompañar el producto durante todo el transporte hasta el establecimiento de destino.';
  autoTable(doc, {
    ...base,
    startY: finalY(doc) + 4,
    styles: { ...base.styles, fontSize: 7.5, halign: 'left' as const },
    body: [[nota]],
  });

  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text('Elaboró: © Grupo Santacruz, 2026', margin, pageH - 8);
    doc.text(
      `Operario: ${operario.toUpperCase()} | ${new Date().toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}`,
      pageW - margin,
      pageH - 8,
      { align: 'right' },
    );
    if (total > 1) doc.text(`Página ${p} de ${total}`, pageW / 2, pageH - 8, { align: 'center' });
  }

  return { doc, archivo: `guiatransporte-${r.codigo}${interna ? '-interna' : ''}.pdf` };
}

export async function descargarGuiaPdf(r: Remision, operario: string, vista: VistaRemision = 'cliente') {
  const { doc, archivo } = await generarGuiaPdf(r, operario, vista);
  doc.save(archivo);
}

/** URL (blob) del PDF de la guía para mostrarla en un visor; liberar con `URL.revokeObjectURL`. */
export async function urlGuiaPdf(r: Remision, operario: string, vista: VistaRemision = 'cliente') {
  const { doc } = await generarGuiaPdf(r, operario, vista);
  return URL.createObjectURL(doc.output('blob'));
}
