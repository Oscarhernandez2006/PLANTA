import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import logoUrl from '@/assets/logo-santacruz.png';

export interface SeccionPdf {
  titulo: string;
  /** Fecha/operario del paso. */
  meta?: string;
  datos?: [string, string][];
  tabla?: { columnas: string[]; filas: (string | number)[][] };
  nota?: string;
}

const PRIMARIO: [number, number, number] = [14, 107, 92];
const GRIS: [number, number, number] = [241, 245, 249];
const TEXTO: [number, number, number] = [30, 41, 59];

function cargarImagen(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

const finalY = (doc: jsPDF) => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

/** Pares etiqueta/valor en filas de 4 columnas (2 pares por fila). */
function filasDatos(datos: [string, string][]) {
  const filas: string[][] = [];
  for (let i = 0; i < datos.length; i += 2) {
    const a = datos[i];
    const b = datos[i + 1];
    filas.push([a[0], a[1] || '—', b?.[0] ?? '', b ? b[1] || '—' : '']);
  }
  return filas;
}

/** Informe de trazabilidad en PDF (auditorías / reclamos). */
export async function descargarTrazabilidadPdf(p: {
  titulo: string;
  codigo: string;
  subtitulo: string;
  estado: string;
  resumen: [string, string][];
  secciones: SeccionPdf[];
}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const m = 12;

  const img = await cargarImagen(logoUrl);
  if (img) doc.addImage(img, 'PNG', m, m, 26, 15, undefined, 'FAST');
  doc.setTextColor(...TEXTO);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('AGROPECUARIA SANTA CRUZ LTDA', pageW - m, m + 4, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('NIT. 830.505.537-2 · MALAMBO - ATLÁNTICO', pageW - m, m + 8.5, { align: 'right' });
  doc.text(`Generado ${new Date().toLocaleString('es-CO')}`, pageW - m, m + 12.5, { align: 'right' });

  let y = m + 22;
  doc.setFillColor(...PRIMARIO);
  doc.rect(m, y, pageW - m * 2, 12, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(p.titulo.toUpperCase(), m + 3, y + 5);
  doc.setFontSize(9);
  doc.text(`${p.codigo} · ${p.subtitulo}`.toUpperCase(), m + 3, y + 9.5);
  doc.text(p.estado.toUpperCase(), pageW - m - 3, y + 7.5, { align: 'right' });
  y += 15;

  const base = {
    margin: { left: m, right: m },
    styles: { fontSize: 8, cellPadding: 1.3, textColor: TEXTO, lineColor: [226, 232, 240] as [number, number, number], lineWidth: 0.2 },
  };
  const tablaDatos = (datos: [string, string][], startY: number) =>
    autoTable(doc, {
      ...base,
      startY,
      theme: 'grid',
      body: filasDatos(datos),
      columnStyles: {
        0: { fontStyle: 'bold', fillColor: GRIS, cellWidth: 36 },
        1: { cellWidth: 57 },
        2: { fontStyle: 'bold', fillColor: GRIS, cellWidth: 36 },
        3: { cellWidth: 57 },
      },
    });

  tablaDatos(p.resumen, y);
  y = finalY(doc) + 6;

  for (const s of p.secciones) {
    if (y > pageH - 30) {
      doc.addPage();
      y = m;
    }
    doc.setTextColor(...PRIMARIO);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(s.titulo.toUpperCase(), m, y);
    if (s.meta) {
      doc.setTextColor(100, 116, 139);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.text(s.meta, pageW - m, y, { align: 'right' });
    }
    doc.setDrawColor(...PRIMARIO);
    doc.setLineWidth(0.4);
    doc.line(m, y + 1.2, pageW - m, y + 1.2);
    y += 3;
    if (s.nota) {
      doc.setTextColor(...TEXTO);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      const lineas = doc.splitTextToSize(s.nota, pageW - m * 2);
      doc.text(lineas, m, y + 3);
      y += 3 + lineas.length * 3.6;
    }
    if (s.datos?.length) {
      tablaDatos(s.datos, y);
      y = finalY(doc) + 2;
    }
    if (s.tabla?.filas.length) {
      autoTable(doc, {
        ...base,
        startY: y,
        theme: 'striped',
        head: [s.tabla.columnas],
        body: s.tabla.filas.map((f) => f.map(String)),
        headStyles: { fillColor: PRIMARIO, textColor: 255, fontSize: 7.5 },
      });
      y = finalY(doc) + 2;
    }
    y += 5;
  }

  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    doc.setTextColor(148, 163, 184);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(`Trazabilidad ${p.codigo} · página ${i} de ${paginas}`, pageW / 2, pageH - 6, { align: 'center' });
  }
  doc.save(`trazabilidad-${p.codigo.replace(/[^\w-]+/g, '_')}.pdf`);
}
