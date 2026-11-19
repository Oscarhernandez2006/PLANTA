import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import logoUrl from '@/assets/logo-santacruz.png';

export interface ListadoInforme {
  titulo: string;
  archivo: string;
  hasta: string;
  desde: string;
  filtros: string[];
  total?: string;
  columnas: string[];
  filas: string[][];
}

async function cargarLogo() {
  const respuesta = await fetch(logoUrl);
  if (!respuesta.ok) throw new Error('No se pudo cargar el logo del informe.');
  return respuesta.arrayBuffer();
}

function metadatos(listado: ListadoInforme) {
  return [
    `Periodo: ${listado.desde} a ${listado.hasta} | Órdenes: ${listado.filas.length}`,
    `Generado: ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`,
    `Filtros: ${listado.filtros.join(' | ') || 'Sin filtros adicionales'}`,
    ...(listado.total ? [listado.total] : []),
  ];
}

export async function descargarListadoPdf(listado: ListadoInforme) {
  const logo = await cargarLogo();
  const doc = new jsPDF({ orientation: 'landscape' });
  doc.addImage(new Uint8Array(logo), 'PNG', 14, 11, 23, 14);
  doc.setFontSize(15);
  doc.text(listado.titulo, 42, 18);
  doc.setFontSize(9);
  const lineas: string[] = metadatos(listado).flatMap((linea) => doc.splitTextToSize(linea, 265));
  doc.text(lineas, 14, 32);
  autoTable(doc, {
    startY: 34 + lineas.length * 4,
    head: [listado.columnas],
    body: listado.filas,
    headStyles: { fillColor: [14, 107, 92] },
    styles: { fontSize: 9, overflow: 'linebreak' },
  });
  doc.save(`${listado.archivo}-${listado.hasta}.pdf`);
}

export async function descargarListadoExcel(listado: ListadoInforme) {
  const [{ default: ExcelJS }, logo] = await Promise.all([import('exceljs'), cargarLogo()]);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Órdenes');
  ws.addRow([]);
  ws.addRow([]);
  ws.addRow([]);
  const imagen = wb.addImage({ buffer: logo, extension: 'png' });
  ws.addImage(imagen, { tl: { col: 0.1, row: 0.1 }, ext: { width: 75, height: 45 } });
  ws.addRow([listado.titulo]).font = { bold: true, size: 12 };
  for (const linea of metadatos(listado)) ws.addRow([linea]);
  ws.addRow([]);
  const head = ws.addRow(listado.columnas);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E6B5C' } };
  });
  listado.columnas.forEach((column, i) => {
    const ancho = listado.filas.reduce((max, fila) => Math.max(max, (fila[i] ?? '').length), column.length);
    ws.getColumn(i + 1).width = Math.min(45, Math.max(14, ancho + 2));
  });
  for (const fila of listado.filas) ws.addRow(fila);
  ws.views = [{ state: 'frozen', ySplit: head.number }];
  ws.autoFilter = { from: { row: head.number, column: 1 }, to: { row: head.number + listado.filas.length, column: listado.columnas.length } };
  const buffer = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${listado.archivo}-${listado.hasta}.xlsx`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
