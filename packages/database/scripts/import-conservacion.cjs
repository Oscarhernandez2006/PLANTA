// Uso: node scripts/import-conservacion.cjs "<archivo.xlsx>" "<concepto cliente>"
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const ExcelJS = require(require.resolve('exceljs', { paths: [path.join(__dirname, '../../../apps/web')] }));

const prisma = new PrismaClient();

const TIPOS = ['TERMINADO', 'EN PROCESO', 'MATERIA PRIMA', 'SUBPRODUCTO'];

function texto(v) {
  if (v == null) return null;
  if (typeof v === 'object' && 'result' in v) v = v.result;
  const s = String(v).trim();
  return s === '' || s === '0' ? null : s;
}

function entero(v) {
  const n = Number(texto(v) ?? 0);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

async function main() {
  const [archivo, clienteNombre] = process.argv.slice(2);
  if (!archivo || !clienteNombre) throw new Error('Uso: import-conservacion.cjs <archivo.xlsx> <cliente>');

  const cliente = await prisma.cliente.findFirst({
    where: { concepto: { equals: clienteNombre, mode: 'insensitive' } },
    select: { id: true, concepto: true },
  });
  if (!cliente) throw new Error(`Cliente no encontrado: ${clienteNombre}`);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.resolve(archivo));
  const ws = wb.worksheets[0];

  // Algunos archivos no traen la columna vacía inicial: se ubica la columna CÓDIGO en el encabezado.
  const encabezado = ws.getRow(1).values.map((v) => String(texto(v) ?? '').toUpperCase());
  const colCodigo = encabezado.findIndex((v) => v === 'CÓDIGO' || v === 'CODIGO');
  const d = colCodigo > 0 ? colCodigo - 4 : 0;

  let ok = 0;
  const faltantes = [];
  for (let i = 3; i <= ws.rowCount; i++) {
    const r = ws.getRow(i).values;
    const codigo = texto(r[4 + d]);
    if (!codigo) continue;
    const tipo = String(texto(r[3 + d]) ?? 'TERMINADO').toUpperCase();

    const product = await prisma.product.findFirst({ where: { codigo }, select: { id: true } });
    if (!product) {
      faltantes.push(`${codigo} ${texto(r[5 + d]) ?? ''}`);
      continue;
    }

    const data = {
      tipo: TIPOS.includes(tipo) ? tipo : 'TERMINADO',
      refPluSku: texto(r[6 + d]),
      refrigeradoDias: entero(r[7 + d]),
      refrigeradoTemp: texto(r[8 + d]) ?? '0°C A 4°C',
      congeladoDias: entero(r[9 + d]),
      congeladoTemp: texto(r[10 + d]) ?? '-18°C A -25°C',
    };
    await prisma.clienteProducto.upsert({
      where: { clienteId_productId: { clienteId: cliente.id, productId: product.id } },
      create: { clienteId: cliente.id, productId: product.id, ...data },
      update: data,
    });
    ok++;
  }

  console.log(`${cliente.concepto}: ${ok} productos cargados.`);
  if (faltantes.length) console.log('No existen en el catálogo:', faltantes);
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
