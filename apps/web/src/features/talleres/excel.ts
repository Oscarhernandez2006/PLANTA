import logoUrl from '@/assets/logo-santacruz.png';

export interface ColumnaExcel<T> {
  titulo: string;
  valor: (fila: T) => string | number | null;
  ancho?: number;
  /** Formato numérico de Excel, p. ej. '#,##0.00' o '0.00%'. */
  formato?: string;
}

export interface HojaExcel<T> {
  nombre: string;
  titulo: string;
  columnas: ColumnaExcel<T>[];
  filas: T[];
  totales?: (string | number | null)[];
}

export const FMT_KG = '#,##0.00';
export const FMT_PCT = '0.00"%"';
export const FMT_ENTERO = '#,##0';
export const FMT_PESOS = '"$" #,##0';

const VERDE = 'FF156F21';

/** Libro con una hoja por tabla: encabezado de la empresa, títulos fijos y filtros. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function descargarExcel(archivo: string, hojas: HojaExcel<any>[]) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const logo = await fetch(logoUrl).then((r) => r.arrayBuffer()).catch(() => null);
  const generado = new Date().toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });

  for (const h of hojas) {
    const ws = wb.addWorksheet(h.nombre.slice(0, 31), { views: [{ state: 'frozen', ySplit: 5 }] });
    const n = h.columnas.length;
    h.columnas.forEach((c, i) => (ws.getColumn(i + 1).width = c.ancho ?? 14));
    ws.getRow(1).height = 24;
    ws.getRow(2).height = 20;
    if (logo) {
      const id = wb.addImage({ buffer: logo, extension: 'png' });
      ws.addImage(id, { tl: { col: 0.1, row: 0.1 }, ext: { width: 70, height: 42 } });
    }
    ws.mergeCells(1, 2, 1, Math.max(2, n));
    ws.getCell(1, 2).value = 'AGROPECUARIA SANTA CRUZ LTDA';
    ws.getCell(1, 2).font = { bold: true, size: 13 };
    ws.mergeCells(2, 2, 2, Math.max(2, n));
    ws.getCell(2, 2).value = h.titulo;
    ws.getCell(2, 2).font = { bold: true, size: 11, color: { argb: VERDE } };
    ws.mergeCells(3, 2, 3, Math.max(2, n));
    ws.getCell(3, 2).value = `Generado: ${generado}`;
    ws.getCell(3, 2).font = { size: 9, color: { argb: 'FF6B7280' } };

    const head = ws.getRow(5);
    h.columnas.forEach((c, i) => {
      const cell = head.getCell(i + 1);
      cell.value = c.titulo;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });
    head.height = 30;

    h.filas.forEach((f, r) => {
      const row = ws.getRow(6 + r);
      h.columnas.forEach((c, i) => {
        const cell = row.getCell(i + 1);
        cell.value = c.valor(f);
        if (c.formato) cell.numFmt = c.formato;
      });
      if (r % 2) row.eachCell((cell) => (cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }));
    });

    if (h.totales) {
      const row = ws.getRow(6 + h.filas.length);
      h.totales.forEach((v, i) => {
        const cell = row.getCell(i + 1);
        cell.value = v;
        cell.font = { bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
        if (h.columnas[i]?.formato) cell.numFmt = h.columnas[i].formato!;
      });
    }
    if (h.filas.length) ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5 + h.filas.length, column: n } };
  }

  const buffer = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = archivo;
  a.click();
  URL.revokeObjectURL(url);
}
