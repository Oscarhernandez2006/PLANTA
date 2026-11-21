import { useState } from 'react';
import { FileSpreadsheet, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import logoUrl from '@/assets/logo-santacruz.png';
import type { ItemDespacho } from './api';

type Props = { items: ItemDespacho[]; orden: string; cliente: string; proceso: string; errorCarga?: boolean };

export async function descargarMerma({ items, orden, cliente, proceso }: Props) {
  const [{ default: ExcelJS }, logo] = await Promise.all([import('exceljs'), fetch(logoUrl)]);
  if (!logo.ok) throw new Error('No se pudo cargar el logo del reporte.');
  const wb = new ExcelJS.Workbook();
  const img = wb.addImage({ buffer: await logo.arrayBuffer(), extension: 'png' });
  const hoja = (nombre: string, columnas: string[]) => {
    const ws = wb.addWorksheet(nombre);
    ws.addImage(img, { tl: { col: 0, row: 0 }, ext: { width: 140, height: 55 } });
    ws.mergeCells(1, 3, 1, columnas.length);
    ws.getCell('C1').value = `${proceso} · ${orden}`;
    ws.getCell('C1').font = { bold: true, size: 14, color: { argb: 'FF0E6B5C' } };
    ws.mergeCells(2, 3, 2, columnas.length);
    ws.getCell('C2').value = `Cliente: ${cliente}`;
    ws.getCell('C3').value = `Generado: ${new Date().toLocaleString('es-CO')}`;
    ws.getRow(4).height = 10;
    const head = ws.addRow(columnas);
    head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    head.eachCell((c, i) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E6B5C' } };
      ws.getColumn(i).width = Math.max(17, c.text.length + 3);
    });
    ws.views = [{ state: 'frozen', ySplit: head.number }];
    ws.autoFilter = { from: { row: head.number, column: 1 }, to: { row: head.number, column: columnas.length } };
    return ws;
  };
  const totalBase = items.reduce((sum, i) => sum + i.pesoKg, 0);
  const grupos = new Map<string, ItemDespacho[]>();
  for (const i of items) {
    const grupo = grupos.get(i.pieza) ?? [];
    grupo.push(i);
    grupos.set(i.pieza, grupo);
  }
  const consolidado = hoja('Consolidado', ['Pieza', 'Cantidad', 'Peso base kg', 'Peso despacho kg', 'Merma kg', 'Merma %', 'Participación peso', 'Sin peso despacho']);
  const agregarTotal = (nombre: string, filas: ItemDespacho[], total = false) => {
    const pesadas = filas.filter((i) => i.despachoKg !== null);
    const base = filas.reduce((s, i) => s + i.pesoKg, 0);
    const basePesada = pesadas.reduce((s, i) => s + i.pesoKg, 0);
    const despacho = pesadas.reduce((s, i) => s + i.despachoKg!, 0);
    const merma = basePesada - despacho;
    const row = consolidado.addRow([
      nombre, filas.length, base, pesadas.length ? despacho : null, pesadas.length ? merma : null,
      pesadas.length && basePesada ? merma / basePesada : null, totalBase ? base / totalBase : 0, filas.length - pesadas.length,
    ]);
    row.getCell(6).numFmt = row.getCell(7).numFmt = '0.00%';
    if (total) row.font = { bold: true, color: { argb: 'FF0E6B5C' } };
  };
  for (const [pieza, filas] of grupos) agregarTotal(pieza.toUpperCase(), filas);
  agregarTotal('TOTAL', items, true);
  const detalle = hoja('Detalle', ['Código', 'Origen', 'Pieza', 'Cava', 'Peso base kg', 'Peso despacho kg', 'Merma kg', 'Merma %', 'Participación peso']);
  for (const i of items) {
    const merma = i.despachoKg === null ? null : i.pesoKg - i.despachoKg;
    const row = detalle.addRow([
      i.barcode, `${i.recibida ? 'RC' : 'OB'}${i.reference}`, i.pieza.toUpperCase(), i.cavaOrigen,
      i.pesoKg, i.despachoKg, merma, merma !== null && i.pesoKg ? merma / i.pesoKg : null,
      totalBase ? i.pesoKg / totalBase : 0,
    ]);
    row.getCell(8).numFmt = row.getCell(9).numFmt = '0.00%';
  }
  const buffer = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `merma-${orden}.xlsx`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ReporteMerma(props: Props) {
  const [exportando, setExportando] = useState(false);
  const [error, setError] = useState('');
  async function descargar() {
    setExportando(true);
    setError('');
    try {
      await descargarMerma(props);
    } catch (e) {
      console.error('Error al descargar la merma:', e);
      setError('No se pudo descargar el reporte de merma.');
    } finally {
      setExportando(false);
    }
  }
  return (
    <div>
      <Button variant="outline" className="h-12" disabled={!props.items.length || exportando} onClick={() => void descargar()}>
        {exportando ? <LoaderCircle className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />}
        Excel merma
      </Button>
      {(error || props.errorCarga) && <p role="alert" className="text-xs text-red-700">{error || 'No se pudieron cargar las canales para el reporte.'}</p>}
    </div>
  );
}
