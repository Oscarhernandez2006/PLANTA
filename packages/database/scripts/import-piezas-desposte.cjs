// Uso: node scripts/import-piezas-desposte.cjs "<archivo.xlsx>" "<concepto cliente>"
// Carga Piezas x canal / Unds x caja (y tipo) por producto del cliente. Si el
// producto no estaba en su conservación, lo agrega con los valores por defecto.
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const ExcelJS = require(require.resolve('exceljs', { paths: [path.join(__dirname, '../../../apps/web')] }));

const prisma = new PrismaClient();
const TIPOS = ['TERMINADO', 'EN PROCESO', 'MATERIA PRIMA', 'SUBPRODUCTO'];

const texto = (v) => (v == null ? '' : String(typeof v === 'object' && 'result' in v ? v.result : v).trim());
const entero = (v) => Math.max(1, Math.round(Number(texto(v)) || 1));

async function main() {
  const [archivo, clienteNombre] = process.argv.slice(2);
  if (!archivo || !clienteNombre) throw new Error('Uso: import-piezas-desposte.cjs <archivo.xlsx> <cliente>');

  const cliente = await prisma.cliente.findFirst({
    where: { concepto: { equals: clienteNombre, mode: 'insensitive' } },
    select: { id: true, concepto: true },
  });
  if (!cliente) throw new Error(`Cliente no encontrado: ${clienteNombre}`);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.resolve(archivo));
  const ws = wb.worksheets[0];

  let actualizados = 0;
  let agregados = 0;
  const faltantes = [];
  const codigosExcel = new Set();
  for (let i = 2; i <= ws.rowCount; i++) {
    const r = ws.getRow(i).values;
    const codigo = texto(r[3]);
    if (!codigo) continue;
    codigosExcel.add(codigo);
    const tipoTxt = texto(r[2]).toUpperCase();
    const data = {
      ...(TIPOS.includes(tipoTxt) ? { tipo: tipoTxt } : {}),
      piezasPorCanal: entero(r[5]),
      undsPorCaja: entero(r[6]),
    };

    const product = await prisma.product.findFirst({ where: { codigo }, select: { id: true } });
    if (!product) {
      faltantes.push(`${codigo} ${texto(r[4])}`);
      continue;
    }
    const existe = await prisma.clienteProducto.findUnique({
      where: { clienteId_productId: { clienteId: cliente.id, productId: product.id } },
      select: { productId: true },
    });
    if (existe) {
      await prisma.clienteProducto.update({
        where: { clienteId_productId: { clienteId: cliente.id, productId: product.id } },
        data,
      });
      actualizados++;
    } else {
      await prisma.clienteProducto.create({ data: { clienteId: cliente.id, productId: product.id, ...data } });
      agregados++;
    }
  }

  const sobrantes = await prisma.clienteProducto.findMany({
    where: { clienteId: cliente.id, product: { codigo: { notIn: [...codigosExcel] } } },
    select: { product: { select: { codigo: true, nombre: true } } },
  });

  console.log(`${cliente.concepto}: ${actualizados} actualizados, ${agregados} agregados.`);
  if (faltantes.length) console.log('No existen en el catálogo:', faltantes);
  if (sobrantes.length) {
    console.log('En conservación pero NO en el Excel:', sobrantes.map((s) => `${s.product.codigo} ${s.product.nombre}`));
  }
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
