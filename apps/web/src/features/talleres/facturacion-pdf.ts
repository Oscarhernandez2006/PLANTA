import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import logoUrl from '@/assets/logo-santacruz.png';
import type { LineaGasto } from './api';

const INK: [number, number, number] = [31, 41, 55];
const GRAY: [number, number, number] = [243, 244, 246];
const TEXT: [number, number, number] = [17, 17, 17];
const VERDE: [number, number, number] = [21, 111, 33];

export interface DocumentoFacturacion {
  taller: 'DESPOSTE' | 'ACONDICIONAMIENTO';
  numero: string;
  fecha: string;
  cliente: string;
  referencia: string;
  productos: { codigo: string; nombre: string; unds: number; kg: number; precioKg: number; valor: number }[];
  servicios: LineaGasto[];
  operario: string;
}

const pesos = (v: number) => v.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const pesosDec = (v: number) => v.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (v: number, d = 2) => v.toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });
const ahora = () => new Date().toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });

function cargarImagen(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

const finalY = (doc: jsPDF) => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

/** Facturación interna de un lote de desposte o un proceso de acondicionamiento (no es factura DIAN). */
export async function descargarFacturacionInterna(d: DocumentoFacturacion) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 10;

  doc.setDrawColor(...INK);
  doc.setLineWidth(0.3);
  doc.rect(margin, margin, pageW - margin * 2, 22);
  const img = await cargarImagen(logoUrl);
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
    styles: { lineColor: INK, lineWidth: 0.25, textColor: TEXT, fontSize: 8.5, cellPadding: 1.3, halign: 'center' as const },
    headStyles: { fillColor: GRAY, textColor: TEXT, fontStyle: 'bold' as const, lineColor: INK, lineWidth: 0.25 },
  };
  const lbl = { fontStyle: 'bold' as const, fillColor: GRAY };
  const der = { halign: 'right' as const };

  autoTable(doc, {
    ...base,
    startY: margin + 22,
    styles: { ...base.styles, fontSize: 12, fontStyle: 'bold' },
    body: [[`FACTURACIÓN INTERNA · TALLER DE ${d.taller} · ${d.numero}`]],
  });
  autoTable(doc, {
    ...base,
    startY: finalY(doc) + 3,
    body: [
      ['FECHA', 'CLIENTE', 'REFERENCIA'].map((t) => ({ content: t, styles: lbl })),
      [d.fecha, d.cliente, d.referencia],
    ],
  });

  const totalProductos = d.productos.reduce((s, p) => s + p.valor, 0);
  const totalKg = d.productos.reduce((s, p) => s + p.kg, 0);
  autoTable(doc, {
    ...base,
    startY: finalY(doc) + 4,
    head: [[{ content: 'PRODUCTO', colSpan: 7 }], ['No.', 'CÓDIGO', 'DESCRIPCIÓN', 'UNDS', 'CANT. (kg)', 'PRECIO / kg', 'VALOR']],
    body: [
      ...d.productos.map((p, i) => [
        String(i + 1).padStart(2, '0'),
        p.codigo,
        { content: p.nombre, styles: { halign: 'left' as const } },
        String(p.unds),
        { content: num(p.kg), styles: der },
        { content: p.precioKg > 0 ? pesosDec(p.precioKg) : 'SIN PRECIO', styles: der },
        { content: pesos(p.valor), styles: der },
      ]),
      [
        { content: 'TOTAL PRODUCTO', colSpan: 4, styles: { ...lbl, ...der } },
        { content: num(totalKg), styles: { ...lbl, ...der } },
        { content: '', styles: lbl },
        { content: pesos(totalProductos), styles: { ...lbl, ...der } },
      ],
    ],
  });

  const totalServicios = d.servicios.reduce((s, g) => s + g.total, 0);
  autoTable(doc, {
    ...base,
    startY: finalY(doc) + 4,
    head: [[{ content: 'SERVICIOS DE PROCESO', colSpan: 4 }], ['CONCEPTO', 'CANTIDAD', 'TARIFA', 'TOTAL']],
    body: [
      ...(d.servicios.length
        ? d.servicios.map((g) => [
            { content: g.concepto, styles: { halign: 'left' as const } },
            { content: num(g.cantidad), styles: der },
            { content: pesosDec(g.valorUnitario), styles: der },
            { content: pesos(g.total), styles: der },
          ])
        : [[{ content: 'Sin servicios cobrados.', colSpan: 4 }]]),
      [
        { content: 'TOTAL SERVICIOS', colSpan: 3, styles: { ...lbl, ...der } },
        { content: pesos(totalServicios), styles: { ...lbl, ...der } },
      ],
    ],
  });

  autoTable(doc, {
    ...base,
    startY: finalY(doc) + 4,
    tableWidth: 100,
    margin: { left: pageW - margin - 100, right: margin },
    styles: { ...base.styles, fontSize: 10 },
    body: [
      [{ content: 'TOTAL PRODUCTO', styles: lbl }, { content: pesos(totalProductos), styles: der }],
      [{ content: 'TOTAL SERVICIOS', styles: lbl }, { content: pesos(totalServicios), styles: der }],
      [
        { content: 'TOTAL DOCUMENTO', styles: { ...lbl, textColor: VERDE } },
        { content: pesos(totalProductos + totalServicios), styles: { ...der, fontStyle: 'bold' as const, textColor: VERDE } },
      ],
    ],
  });

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.text('Documento interno de liquidación del taller. No es una factura electrónica de venta.', margin, pageH - 13);
  doc.setFont('helvetica', 'bold');
  doc.text('Elaboró: © Grupo Santacruz, 2026', margin, pageH - 8);
  doc.text(`Operario: ${d.operario.toUpperCase()} | ${ahora()}`, pageW - margin, pageH - 8, { align: 'right' });
  doc.save(`facturacion-interna-${d.numero.replace(/\s+/g, '')}.pdf`);
}
