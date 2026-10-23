import { CONCEPTOS, totalesRetoma, type FilaRetoma } from './retomas-api';

const ENCABEZADOS = [
  'FECHA', 'FIRMADOR', 'RESES', 'CABEZAS', 'DESPOJOS', 'LIBROS', 'PIELES', 'VISCERAS ROJAS', 'SEBO',
  'VALOR CABEZAS', 'VALOR DESPOJOS', 'VALOR LIBROS', 'VALOR PIELES', 'VALOR VISCERAS ROJAS', 'VALOR SEBO',
  'TOTAL CABEZAS', 'TOTAL DESPOJOS', 'TOTAL LIBROS', 'TOTAL PIELES', 'TOTAL VISCERAS ROJAS', 'TOTAL SEBO', 'TOTAL',
];
const ANCHOS = [30, 45, 9, 10, 11, 9, 10, 11, 9, 13, 13, 13, 13, 13, 13, 14, 14, 14, 14, 14, 14, 16];
const MONEDA = '"$" #,##0';
// Columnas de cantidad (D..I) y de valor (J..O) en el mismo orden que CONCEPTOS.
const COL_CANT = ['D', 'E', 'F', 'G', 'H', 'I'];
const COL_VALOR = ['J', 'K', 'L', 'M', 'N', 'O'];

/** Descarga las filas visibles como la hoja RETOMAS (con sus fórmulas). */
export async function exportarRetomasExcel(filas: FilaRetoma[], nombre: string) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('RETOMAS', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = ANCHOS.map((width) => ({ width }));

  const head = ws.addRow(ENCABEZADOS);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  head.height = 30;
  head.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
  });

  filas.forEach((f, i) => {
    const r = i + 2;
    const t = totalesRetoma(f);
    const [y, m, d] = f.fecha.split('-').map(Number);
    const row = ws.addRow([
      new Date(Date.UTC(y, m - 1, d)),
      f.firmador ?? '',
      f.reses,
      ...CONCEPTOS.map(([q]) => f[q] ?? ''),
      ...CONCEPTOS.map(([, v]) => f[v]),
      ...CONCEPTOS.map((_, k) => ({ formula: `${COL_CANT[k]}${r}*${COL_VALOR[k]}${r}`, result: t.porConcepto[k] })),
      { formula: `SUM(P${r}:U${r})`, result: t.total },
    ]);
    row.getCell(1).numFmt = 'dddd, mmmm dd, yyyy';
    for (let c = 10; c <= 22; c++) row.getCell(c).numFmt = MONEDA;
  });

  const ult = filas.length + 1;
  const sumas = ['C', 'D', 'E', 'F', 'G', 'H', 'I'].map((col) => ({ formula: `SUBTOTAL(109,${col}2:${col}${ult})` }));
  const totales = ['P', 'Q', 'R', 'S', 'T', 'U', 'V'].map((col) => ({ formula: `SUBTOTAL(109,${col}2:${col}${ult})` }));
  const total = ws.addRow(['Total', '', ...sumas, '', '', '', '', '', '', ...totales]);
  total.font = { bold: true };
  for (let c = 16; c <= 22; c++) total.getCell(c).numFmt = MONEDA;
  ws.autoFilter = { from: 'A1', to: `V${ult}` };

  const buffer = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = `${nombre}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
