// Importa clientes (hoja "Clientes planta") y sus tiendas (hoja "Sucursales")
// del Excel BD_clientes_planta.xlsx. Cliente = razón social (o nombre si no
// tiene); cada cliente nace con su bodega. Los códigos de sucursal del Excel se
// ignoran: las tiendas reciben el consecutivo 01, 02, … del cliente.
// No modifica clientes ni tiendas que ya existan (por nombre).
// Uso: node scripts/import-clientes.cjs "<archivo.xlsx>"
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const ExcelJS = require(require.resolve('exceljs', { paths: [path.join(__dirname, '../../../apps/web')] }));

const prisma = new PrismaClient();

function valor(v) {
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    if ('result' in v) return v.result;
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
    if ('text' in v) return v.text;
    if ('error' in v) return null;
  }
  return v;
}

function texto(v, max, mayus = true) {
  v = valor(v);
  if (v == null) return null;
  let s = String(v).trim().replace(/\s+/g, ' ');
  if (!s) return null;
  if (mayus) s = s.toUpperCase();
  return max ? s.slice(0, max) : s;
}

// "ALCOSTO LA 13 (900554896-002)" -> "ALCOSTO LA 13"
const sinCodigo = (s) => s && s.replace(/\s*\([^)]*\)\s*$/, '').trim();

async function main() {
  const [archivo] = process.argv.slice(2);
  if (!archivo) throw new Error('Uso: import-clientes.cjs <archivo.xlsx>');

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.resolve(archivo));

  // Clientes: A NIT, B nombre, C razón social, G contacto, H teléfono,
  // I correo, J dirección, L ciudad.
  const wsC = wb.getWorksheet('Clientes planta');
  const clientes = [];
  for (let i = 2; i <= wsC.rowCount; i++) {
    const r = wsC.getRow(i);
    const concepto = texto(r.getCell(3).value, 120) ?? texto(r.getCell(2).value, 120);
    if (!concepto) continue;
    clientes.push({
      concepto,
      nit: texto(r.getCell(1).value, 30),
      contacto: texto(r.getCell(7).value, 120),
      telefono: texto(r.getCell(8).value, 40),
      correo: texto(r.getCell(9).value, 120, false)?.toLowerCase() ?? null,
      direccion: texto(r.getCell(10).value, 160),
      ciudad: texto(r.getCell(12).value, 80),
    });
  }

  // Misma razón social con distinto NIT: se distingue con el NIT.
  const veces = new Map();
  for (const c of clientes) veces.set(c.concepto, (veces.get(c.concepto) ?? 0) + 1);
  for (const c of clientes) {
    if (veces.get(c.concepto) > 1 && c.nit) c.concepto = `${c.concepto} (${c.nit})`.slice(0, 120);
  }

  // Sucursales: A NIT cliente, D nombre, E dirección, G ciudad.
  const wsS = wb.getWorksheet('Sucursales');
  const sucursales = new Map();
  for (let i = 2; i <= wsS.rowCount; i++) {
    const r = wsS.getRow(i);
    const nit = texto(r.getCell(1).value, 30);
    const nombre = sinCodigo(texto(r.getCell(4).value, 160))?.slice(0, 120);
    if (!nit || !nombre) continue;
    if (!sucursales.has(nit)) sucursales.set(nit, []);
    sucursales.get(nit).push({
      nombre,
      direccion: texto(r.getCell(5).value, 160),
      ciudad: texto(r.getCell(7).value, 80),
    });
  }

  let nuevosClientes = 0;
  let nuevasTiendas = 0;
  let omitidos = 0;
  for (const c of clientes) {
    let cliente = await prisma.cliente.findUnique({ where: { concepto: c.concepto }, select: { id: true } });
    if (cliente) {
      omitidos++;
    } else {
      cliente = await prisma.cliente.create({
        data: { ...c, bodegas: { create: { nombre: c.concepto } } },
        select: { id: true },
      });
      nuevosClientes++;
    }

    const existentes = await prisma.clienteTienda.findMany({
      where: { clienteId: cliente.id },
      select: { codigo: true, nombre: true },
    });
    const nombres = new Set(existentes.map((t) => t.nombre));
    let n = existentes.reduce((m, t) => (/^\d+$/.test(t.codigo) ? Math.max(m, Number(t.codigo)) : m), 0);
    const nuevas = [];
    for (const s of (c.nit && sucursales.get(c.nit)) || []) {
      if (nombres.has(s.nombre)) continue;
      nombres.add(s.nombre);
      nuevas.push({ clienteId: cliente.id, codigo: String(++n).padStart(2, '0'), ...s });
    }
    if (nuevas.length) {
      await prisma.clienteTienda.createMany({ data: nuevas });
      nuevasTiendas += nuevas.length;
    }
  }

  console.log(`Clientes nuevos: ${nuevosClientes} (ya exist\u00edan: ${omitidos})`);
  console.log(`Tiendas nuevas: ${nuevasTiendas}`);
}

main()
  .catch((e) => {
    console.error(e.message ?? e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
