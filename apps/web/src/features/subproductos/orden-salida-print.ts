import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface OrdenSalidaItem {
  codigo: string;
  label: string;
  unidad: 'unidad' | 'kg';
  marcados: number;
  totalKg: number | null;
}

export interface OrdenSalidaData {
  reference: number;
  cliente: string;
  guias: string[];
  fecha: string;
  responsable: string;
  observaciones: string | null;
  items: OrdenSalidaItem[];
}

/** Genera y descarga el PDF de constancia de salida de subproductos con el firmante. */
export function downloadOrdenSalidaPdf(d: OrdenSalidaData) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const margin = 14;
  const pageW = doc.internal.pageSize.getWidth();

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('ORDEN DE SALIDA DE SUBPRODUCTOS', pageW / 2, margin, {
    align: 'center',
  });

  autoTable(doc, {
    startY: margin + 6,
    margin: { left: margin, right: margin },
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2 },
    body: [
      [
        { content: 'Lote N.º', styles: { fontStyle: 'bold' as const } },
        String(d.reference),
        { content: 'Fecha', styles: { fontStyle: 'bold' as const } },
        d.fecha,
      ],
      [
        { content: 'Cliente / Firmante', styles: { fontStyle: 'bold' as const } },
        d.cliente,
        { content: 'Guía(s)', styles: { fontStyle: 'bold' as const } },
        d.guias.join(', ') || '—',
      ],
      [
        { content: 'Responsable', styles: { fontStyle: 'bold' as const } },
        d.responsable,
        { content: 'Observaciones', styles: { fontStyle: 'bold' as const } },
        d.observaciones || '—',
      ],
    ],
  });

  const afterHeader = (doc as unknown as { lastAutoTable: { finalY: number } })
    .lastAutoTable.finalY;

  autoTable(doc, {
    startY: afterHeader + 4,
    margin: { left: margin, right: margin },
    head: [['Código', 'Producto', 'Cantidad', 'Total kg']],
    body: d.items.map((i) => [
      i.codigo,
      i.label,
      String(i.marcados),
      i.unidad === 'kg' ? (i.totalKg ?? 0).toFixed(2) : '—',
    ]),
    styles: { fontSize: 8, cellPadding: 1.8 },
    headStyles: { fillColor: [31, 41, 55] },
  });

  const afterTable = (doc as unknown as { lastAutoTable: { finalY: number } })
    .lastAutoTable.finalY;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(
    'Declaro que retiro de la planta los subproductos relacionados arriba.',
    margin,
    afterTable + 14,
  );
  doc.line(margin, afterTable + 30, margin + 70, afterTable + 30);
  doc.text('Firma de quien retira', margin, afterTable + 34);
  doc.line(pageW - margin - 70, afterTable + 30, pageW - margin, afterTable + 30);
  doc.text('Firma del responsable de planta', pageW - margin - 70, afterTable + 34);

  doc.save(`orden-salida-lote-${d.reference}.pdf`);
}
