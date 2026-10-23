import { calcular, type FilaBeneficio } from './beneficio-api';

const ENCABEZADOS = [
  'No SEMANA', 'FECHA', 'PROVEEDOR', 'FIRMADOR', 'CLIENTE', 'GRANJA', 'MUNICIPIO',
  'No DE GUIA ICA', 'LOTE', 'NOVILLO', 'NOVILLA', 'VACA', 'TORO', 'BUFALO', 'TOTAL RESES',
  'PIELES', 'PESO PIE', 'PESO CALIENTE', 'PROMEDIO PESO CALIENTE', 'RENDIMIENTO',
  'TARIFA DE SACRIFICIO', 'TOTAL SACRIFICIO',
];
const ANCHOS = [9, 30, 40, 40, 40, 32, 26, 22, 11, 10, 10, 10, 10, 10, 13, 10, 12, 15, 14, 14, 16, 18];
const MONEDA = '"$" #,##0';

/** Descarga las filas visibles como la hoja BENEFICIO (con sus fórmulas). */
export async function exportarBeneficioExcel(filas: FilaBeneficio[], nombre: string) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('BENEFICIO', { views: [{ state: 'frozen', ySplit: 1 }] });
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
    const c = calcular(f);
    const [y, m, d] = f.fecha.split('-').map(Number);
    const row = ws.addRow([
      { formula: `WEEKNUM(B${r},1)`, result: c.semana },
      new Date(Date.UTC(y, m - 1, d)),
      f.proveedor ?? '', f.firmador ?? '', f.cliente ?? '', f.granja ?? '', f.municipio ?? '',
      f.guiaIca ?? '', f.lote ?? '',
      f.novillo, f.novilla, f.vaca, f.toro, f.bufalo,
      { formula: `SUM(J${r}:N${r})`, result: c.reses },
      f.pieles ?? '', f.pesoPieKg ?? '', f.pesoCalienteKg ?? '',
      { formula: `IFERROR(R${r}/O${r},0)`, result: c.promedio },
      { formula: `IFERROR(R${r}*100/Q${r},0)`, result: c.rendimiento },
      c.tarifa,
      { formula: `O${r}*U${r}`, result: c.totalSacrificio },
    ]);
    row.getCell(2).numFmt = 'dddd, mmmm dd, yyyy';
    row.getCell(19).numFmt = '0.0';
    row.getCell(20).numFmt = '0.00';
    row.getCell(21).numFmt = MONEDA;
    row.getCell(22).numFmt = MONEDA;
  });

  const ult = filas.length + 1;
  const total = ws.addRow([
    '', 'Total', '', '', '', '', '', '', '',
    ...['J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R'].map((col) => ({ formula: `SUBTOTAL(109,${col}2:${col}${ult})` })),
    { formula: `SUBTOTAL(101,S2:S${ult})` }, '', '',
    { formula: `SUBTOTAL(109,V2:V${ult})` },
  ]);
  total.font = { bold: true };
  total.getCell(19).numFmt = '0.0';
  total.getCell(22).numFmt = MONEDA;
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
