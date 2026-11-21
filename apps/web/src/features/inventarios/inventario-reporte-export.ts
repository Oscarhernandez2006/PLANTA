import logoUrl from '@/assets/logo-santacruz.png';
import { codigoBarras } from '../canal-caliente/canal-presinto-print';
import type { BodegaDetalle } from './api';

type Producto = BodegaDetalle['productos'][number];
type Canal = BodegaDetalle['canales'][number];
type Datos = {
  tipo: 'productos' | 'canales';
  cliente: string;
  bodega: string;
  productos: Producto[];
  canales: Canal[];
};

const fecha = (iso: string | null) => iso ? iso.split('-').reverse().join('/') : '';

function estadoProducto(p: Producto) {
  return p.transformadoOc ? `TRANSFORMADO OC${p.transformadoOc}` :
    p.despachoDc ? `EN DESPACHO DC${p.despachoDc}` :
      p.trasladoOt ? `EN PROCESO OT${p.trasladoOt}` : 'DISPONIBLE';
}

function estadoCanal(c: Canal) {
  return c.enDespacho ? `${c.enDespacho.cerrada ? 'DESPACHADA' : 'EN DESPACHO'} DC${c.enDespacho.dcNumber}` :
    c.enOrden ? `${c.enOrden.cerrada ? 'PROCESADA' : 'EN ORDEN'} OD${c.enOrden.odNumber}` : 'DISPONIBLE';
}

export async function descargarReporteInventario(d: Datos) {
  const [{ default: ExcelJS }, logo] = await Promise.all([import('exceljs'), fetch(logoUrl)]);
  if (!logo.ok) throw new Error('No se pudo cargar el logo del reporte.');
  const wb = new ExcelJS.Workbook();
  const logoId = wb.addImage({ buffer: await logo.arrayBuffer(), extension: 'png' });
  const hoja = (nombre: string, columnas: string[]) => {
    const ws = wb.addWorksheet(nombre);
    ws.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 140, height: 55 } });
    ws.mergeCells(1, 3, 1, columnas.length);
    ws.getCell('C1').value = `INVENTARIO DE ${d.tipo.toUpperCase()}`;
    ws.getCell('C1').font = { bold: true, size: 14, color: { argb: 'FF0E6B5C' } };
    ws.mergeCells(2, 3, 2, columnas.length);
    ws.getCell('C2').value = `${d.cliente} · ${d.bodega}`;
    ws.mergeCells(3, 3, 3, columnas.length);
    ws.getCell('C3').value = `Generado: ${new Date().toLocaleString('es-CO')}`;
    ws.getRow(4).height = 10;
    const head = ws.addRow(columnas);
    head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    head.eachCell((c, i) => {
      ws.getColumn(i).width = Math.max(17, c.text.length + 3);
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E6B5C' } };
    });
    ws.views = [{ state: 'frozen', ySplit: head.number }];
    ws.autoFilter = { from: { row: head.number, column: 1 }, to: { row: head.number, column: columnas.length } };
    return ws;
  };
  if (d.tipo === 'productos') {
    const grupos = new Map<string, { nombre: string; piezas: number; gramos: number; canastillas: Set<string> }>();
    for (const p of d.productos) {
      const g = grupos.get(p.productoCodigo) ?? { nombre: p.productoNombre, piezas: 0, gramos: 0, canastillas: new Set<string>() };
      g.piezas += p.unidades;
      g.gramos += Math.round(p.netoKg * 1000);
      if (p.canastilla !== null && p.opNumber !== null) g.canastillas.add(`${p.opNumber}|${p.productoCodigo}|${p.canastilla}`);
      grupos.set(p.productoCodigo, g);
    }
    const total = [...grupos.values()].reduce((s, g) => s + g.gramos, 0);
    const resumen = hoja('Consolidado', ['Código', 'Producto', 'Canastillas', 'Piezas', 'Peso (kg)', 'Participación por peso']);
    resumen.getColumn(2).width = 38;
    for (const [codigo, g] of [...grupos].sort(([a], [b]) => a.localeCompare(b, 'es', { numeric: true }))) {
      const row = resumen.addRow([codigo, g.nombre, g.canastillas.size, g.piezas, g.gramos / 1000, total ? g.gramos / total : 0]);
      row.getCell(6).numFmt = '0.00%';
    }
    const cajas = new Set([...grupos.values()].flatMap((g) => [...g.canastillas]));
    const unidades = d.productos.reduce((sum, p) => sum + p.unidades, 0);
    const row = resumen.addRow(['TOTAL', '', cajas.size, unidades, total / 1000, total ? 1 : 0]);
    row.font = { bold: true };
    row.getCell(6).numFmt = '0.00%';
    const columnas = ['Código producto', 'Código de barras', 'Producto', 'Pieza', 'Unidades', 'Canastilla', 'Registrado por', 'Peso (kg)', 'Lote', 'Vence', 'Cliente', 'Tienda', 'Bodega', 'Estado'];
    const valores = (p: Producto) => [
      p.productoCodigo, p.codigo, p.productoNombre, p.pieza, p.unidades, p.canastilla, p.etiquetadoPor,
      p.netoKg, p.lote, fecha(p.fechaVencimiento), d.cliente, p.tiendaCodigo ? `${p.tiendaCodigo} - ${p.tienda}` : p.tienda,
      p.bodega, estadoProducto(p),
    ];
    const detalle = hoja('Detalle', columnas);
    const tienda = hoja('Cliente y tienda', columnas);
    detalle.getColumn(3).width = tienda.getColumn(3).width = 38;
    for (const p of d.productos) detalle.addRow(valores(p));
    for (const p of [...d.productos].sort((a, b) => a.tiendaCodigo.localeCompare(b.tiendaCodigo, 'es', { numeric: true }) || a.productoCodigo.localeCompare(b.productoCodigo, 'es', { numeric: true }))) {
      tienda.addRow(valores(p));
    }
  } else {
    const grupos = new Map<string, { piezas: number; gramos: number }>();
    for (const c of d.canales) {
      const g = grupos.get(c.pieza) ?? { piezas: 0, gramos: 0 };
      g.piezas++;
      g.gramos += Math.round(c.pesoKg * 1000);
      grupos.set(c.pieza, g);
    }
    const total = [...grupos.values()].reduce((s, g) => s + g.gramos, 0);
    const resumen = hoja('Consolidado', ['Pieza', 'Cantidad', 'Peso base (kg)', 'Participación por peso']);
    for (const [pieza, g] of grupos) {
      const row = resumen.addRow([pieza.toUpperCase(), g.piezas, g.gramos / 1000, total ? g.gramos / total : 0]);
      row.getCell(4).numFmt = '0.00%';
    }
    const totalRow = resumen.addRow(['TOTAL', d.canales.length, total / 1000, total ? 1 : 0]);
    totalRow.font = { bold: true };
    totalRow.getCell(4).numFmt = '0.00%';
    const detalle = hoja('Canales', ['Código de barras', 'Lote', 'Fecha', 'Tipo', 'Pieza', 'Cava', 'Bodega', 'Estado', 'Peso base (kg)', 'Peso frío (kg)']);
    for (const c of d.canales) {
      const barcode = c.recibo ? `RC${c.recibo.receiptNumber}-${String(c.recibo.codigo).padStart(2, '0')}` :
        c.canalTipo ? codigoBarras({ lote: c.reference, turno: c.turno ?? c.sequence, canalTipo: c.canalTipo, pieza: c.pieza }) : '';
      detalle.addRow([
        barcode, c.recibo?.lote ?? (c.recibo ? `RC${c.recibo.receiptNumber}` : `OB${c.reference}`),
        fecha(c.date), c.canalAnimalTipo ?? (c.recibo ? 'RECIBIDA' : ''), c.pieza.toUpperCase(), c.cava,
        c.bodega, estadoCanal(c), c.pesoKg, c.pesoFrioKg,
      ]);
    }
  }
  const buffer = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `inventario-${d.tipo}-${d.cliente.replace(/[^\w]+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
