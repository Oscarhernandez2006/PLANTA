import { api } from '@/lib/api';
import logoUrl from '@/assets/logo-santacruz.png';

type Pieza = {
  codigoProducto: string;
  nombrePieza: string;
  codigoBarras: string | null;
  pieza: number;
  tienda: string;
  canastillaId: string | null;
  canastilla: number | null;
  etiquetadoPor: string;
  pesoKg: number;
  lote: string;
  vence: string | null;
};

interface OrdenDesposte {
  cliente: string;
  nit: string | null;
  piezas: Pieza[];
}

export function consolidarDesposte(piezas: Pieza[]) {
  const productos = new Map<string, { nombre: string; canastillas: Set<string>; piezas: number; peso: number }>();
  let total = 0;
  for (const pieza of piezas) {
    const fila = productos.get(pieza.codigoProducto) ?? { nombre: pieza.nombrePieza, canastillas: new Set<string>(), piezas: 0, peso: 0 };
    if (pieza.canastillaId) fila.canastillas.add(pieza.canastillaId);
    const gramos = Math.round(pieza.pesoKg * 1000);
    fila.piezas++;
    fila.peso += gramos;
    total += gramos;
    productos.set(pieza.codigoProducto, fila);
  }
  return [...productos].sort(([a], [b]) => a.localeCompare(b, 'es', { numeric: true })).map(([codigo, fila]) => ({
    codigo, nombre: fila.nombre, canastillas: fila.canastillas.size, piezas: fila.piezas,
    pesoKg: fila.peso / 1000, participacion: total ? fila.peso / total : 0,
  }));
}

export type ReporteDesposte = 'consolidado' | 'detalle' | 'cliente-tienda';
export const NOMBRE_REPORTE: Record<ReporteDesposte, string> = {
  consolidado: 'Consolidado por producto',
  detalle: 'Detallado por pieza',
  'cliente-tienda': 'Detallado por cliente y tienda',
};

export async function descargarReporteDesposte(opNumber: number, tipo: ReporteDesposte) {
  const [{ data }, { default: ExcelJS }, logo] = await Promise.all([
    api.get<OrdenDesposte>(`/informes/desposte/${opNumber}/piezas`), import('exceljs'), fetch(logoUrl),
  ]);
  if (!data.piezas.length) throw new Error('Esta orden no tiene piezas activas para exportar.');
  if (!logo.ok) throw new Error('No se pudo cargar el logo para el reporte.');
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet(tipo === 'consolidado' ? 'Por producto' : 'Por pieza');
  const detalle = ['Código de producto', 'Código de barras', 'Nombre de la pieza', 'N.º de pieza', 'Canastilla', 'Etiquetado por', 'Peso neto (kg)', 'Lote', 'Vencimiento'];
  const columnas = tipo === 'consolidado'
    ? ['Código de producto', 'Producto', 'Canastillas', 'Piezas', 'Peso neto (kg)', 'Participación por peso']
    : tipo === 'cliente-tienda' ? ['Cliente', 'Tienda de destino', ...detalle] : detalle;
  const logoId = libro.addImage({ buffer: await logo.arrayBuffer(), extension: 'png' });
  hoja.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 140, height: 55 } });
  hoja.mergeCells(1, 3, 1, columnas.length);
  hoja.getCell('C1').value = `${NOMBRE_REPORTE[tipo]} · OP${opNumber}`;
  hoja.getCell('C1').font = { bold: true, size: 14, color: { argb: 'FF0E6B5C' } };
  hoja.mergeCells(2, 3, 2, columnas.length);
  hoja.getCell('C2').value = `Cliente: ${data.cliente}${data.nit ? ` · NIT ${data.nit}` : ''}`;
  hoja.mergeCells(3, 3, 3, columnas.length);
  hoja.getCell('C3').value = `Generado: ${new Date().toLocaleString('es-CO')}`;
  hoja.getRow(4).height = 10;
  const cabecera = hoja.addRow(columnas);
  cabecera.height = 24;
  cabecera.alignment = { vertical: 'middle' };
  cabecera.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cabecera.eachCell((celda, i) => {
    hoja.getColumn(i).width = Math.max(19, celda.text.length + 3);
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E6B5C' } };
  });
  if (tipo === 'consolidado') {
    hoja.getColumn(2).width = 38;
    for (const f of consolidarDesposte(data.piezas)) {
      hoja.addRow([f.codigo, f.nombre, f.canastillas, f.piezas, f.pesoKg, f.participacion]).getCell(6).numFmt = '0.00%';
    }
    const totalPeso = data.piezas.reduce((suma, p) => suma + Math.round(p.pesoKg * 1000), 0) / 1000;
    const canastillas = new Set(data.piezas.flatMap((p) => p.canastillaId ? [p.canastillaId] : []));
    const total = hoja.addRow(['TOTAL', '', canastillas.size, data.piezas.length, totalPeso, totalPeso ? 1 : 0]);
    total.font = { bold: true, color: { argb: 'FF0E6B5C' } };
    total.getCell(6).numFmt = '0.00%';
  } else {
    const porTienda = tipo === 'cliente-tienda';
    hoja.getColumn(porTienda ? 5 : 3).width = 38;
    const ordenadas = [...data.piezas].sort((a, b) =>
      (porTienda ? a.tienda.localeCompare(b.tienda, 'es', { numeric: true }) : 0) ||
      a.codigoProducto.localeCompare(b.codigoProducto, 'es', { numeric: true }) || a.pieza - b.pieza);
    for (const p of ordenadas) {
      hoja.addRow([
        ...(porTienda ? [data.cliente, p.tienda] : []),
        p.codigoProducto, p.codigoBarras, p.nombrePieza, p.pieza, p.canastilla, p.etiquetadoPor, p.pesoKg, p.lote, p.vence,
      ]);
    }
    hoja.autoFilter = { from: { row: cabecera.number, column: 1 }, to: { row: cabecera.number, column: columnas.length } };
  }
  hoja.views = [{ state: 'frozen', ySplit: cabecera.number }];
  const buffer = await libro.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `desposte-OP${opNumber}-${tipo}.xlsx`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
