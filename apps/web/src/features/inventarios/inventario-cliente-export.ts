import type { BodegaDetalle } from './api';

type Producto = BodegaDetalle['productos'][number];
type Canal = BodegaDetalle['canales'][number];
type Subproducto = BodegaDetalle['subproductos'][number];

const fecha = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '');

/** Existencias de un cliente en Excel: resumen por producto, etiquetas, canales y subproductos. */
export async function descargarInventarioClienteExcel(d: {
  cliente: string;
  nit: string | null;
  bodega: string;
  porProducto: { codigo: string; nombre: string; unds: number; kg: number; disponibles: number; comprometidas: number; vence: string | null }[];
  productos: Producto[];
  canales: Canal[];
  subproductos: Subproducto[];
}) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const titulo = `INVENTARIO ${d.cliente}${d.nit ? ` · NIT ${d.nit}` : ''} · ${d.bodega}`;
  const generado = `Generado ${new Date().toLocaleString('es-CO')}`;

  const hoja = (nombre: string, columnas: { header: string; width: number }[], filas: (string | number | null)[][]) => {
    const ws = wb.addWorksheet(nombre);
    ws.addRow([titulo]).font = { bold: true, size: 12 };
    ws.addRow([generado]).font = { size: 9, italic: true };
    ws.addRow([]);
    const head = ws.addRow(columnas.map((c) => c.header));
    head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    head.eachCell((c) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E6B5C' } };
    });
    columnas.forEach((c, i) => (ws.getColumn(i + 1).width = c.width));
    for (const f of filas) ws.addRow(f);
    ws.views = [{ state: 'frozen', ySplit: 4 }];
    return ws;
  };

  hoja(
    'Por producto',
    [
      { header: 'Código', width: 10 },
      { header: 'Producto', width: 38 },
      { header: 'Unidades', width: 11 },
      { header: 'Kg', width: 12 },
      { header: 'Disponibles', width: 12 },
      { header: 'En proceso / despacho', width: 20 },
      { header: 'Vence (más próximo)', width: 18 },
    ],
    d.porProducto.map((p) => [p.codigo, p.nombre, p.unds, Math.round(p.kg * 100) / 100, p.disponibles, p.comprometidas, fecha(p.vence)]),
  );
  hoja(
    'Etiquetas',
    [
      { header: 'Código de barras', width: 22 },
      { header: 'Producto', width: 34 },
      { header: 'Kg', width: 10 },
      { header: 'Conservación', width: 16 },
      { header: 'Empaque', width: 12 },
      { header: 'Vence', width: 12 },
      { header: 'Origen', width: 12 },
      { header: 'Estado', width: 18 },
    ],
    d.productos.map((p) => [
      p.codigo ?? '',
      `${p.productoCodigo} ${p.productoNombre}`,
      p.netoKg,
      p.conservacion,
      fecha(p.fechaEmpaque),
      fecha(p.fechaVencimiento),
      p.rpNumber ? `RP${p.rpNumber}` : p.ocNumber ? `OC${p.ocNumber}` : p.opNumber ? `OP${p.opNumber}` : '',
      p.despachoDc ? `EN DESPACHO DC${p.despachoDc}` : p.transformadoOc ? 'TRANSFORMADO' : p.trasladoOt ? `EN PROCESO OT${p.trasladoOt}` : 'DISPONIBLE',
    ]),
  );
  hoja(
    'Canales',
    [
      { header: 'Orden', width: 10 },
      { header: 'Pieza', width: 14 },
      { header: 'Fecha', width: 12 },
      { header: 'Tipo', width: 14 },
      { header: 'Cava', width: 14 },
      { header: 'Caliente (kg)', width: 13 },
      { header: 'Frío (kg)', width: 11 },
      { header: 'Estado', width: 22 },
    ],
    d.canales.map((c) => [
      c.recibo ? `RC${c.recibo.receiptNumber}` : `OB${c.reference}`,
      c.recibo ? `RC${c.recibo.receiptNumber}-${String(c.recibo.codigo).padStart(2, '0')}` : `A${String(c.sequence).padStart(2, '0')} ${c.pieza.toUpperCase()}`,
      fecha(c.date),
      c.recibo ? 'RECIBIDA' : (c.canalAnimalTipo ?? '').toUpperCase(),
      c.cava ?? '',
      c.pesoKg,
      c.pesoFrioKg,
      c.enDespacho
        ? `${c.enDespacho.cerrada ? 'DESPACHADA' : 'EN DESPACHO'} DC${c.enDespacho.dcNumber}`
        : c.enOrden
          ? `${c.enOrden.cerrada ? 'PROCESADA' : 'EN ORDEN'} OD${c.enOrden.odNumber}`
          : 'DISPONIBLE',
    ]),
  );
  if (d.subproductos.length)
    hoja(
    'Subproductos',
    [
      { header: 'Código', width: 10 },
      { header: 'Producto', width: 30 },
      { header: 'Cava', width: 10 },
      { header: 'Cantidad', width: 10 },
      { header: 'Kg', width: 10 },
      { header: 'Orden', width: 10 },
    ],
    d.subproductos.map((s) => [s.codigo, s.label, s.cava ?? '', s.cantidad, s.pesoKg, `OB${s.reference}`]),
  );

  const buffer = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = `inventario-${d.cliente.replace(/[^\w]+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
