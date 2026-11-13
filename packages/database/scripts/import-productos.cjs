// Uso: node scripts/import-productos.cjs "<archivo.xlsx>" [codigoPlanta]
// Carga el maestro de productos (columnas: No. | CATEGORÍA | CÓDIGO | PRODUCTO).
// Hace upsert por (planta, código): crea los nuevos y actualiza nombre/categoría
// de los existentes. No borra ni desactiva nada.
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const ExcelJS = require(require.resolve('exceljs', { paths: [path.join(__dirname, '../../../apps/web')] }));

const prisma = new PrismaClient();

const texto = (v) =>
  (v == null ? '' : String(typeof v === 'object' && 'result' in v ? v.result : v)).trim();

async function main() {
  const [archivo, codigoPlanta] = process.argv.slice(2);
  if (!archivo) throw new Error('Uso: import-productos.cjs <archivo.xlsx> [codigoPlanta]');

  const plant = codigoPlanta
    ? await prisma.plant.findUnique({ where: { code: codigoPlanta }, select: { id: true, code: true } })
    : await prisma.plant.findFirst({ select: { id: true, code: true }, orderBy: { createdAt: 'asc' } });
  if (!plant) throw new Error('Planta no encontrada');

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.resolve(archivo));
  const ws = wb.worksheets[0];

  // Ubica las columnas por encabezado para no depender del orden.
  const enc = Array.from(ws.getRow(1).values, (v) => texto(v).toUpperCase());
  const col = (nombre) => enc.findIndex((h) => (h ?? '').startsWith(nombre));
  const cCod = col('CÓDIGO') > 0 ? col('CÓDIGO') : col('CODIGO');
  const cNom = col('PRODUCTO');
  const cCat = col('CATEGOR');
  if (cCod < 1 || cNom < 1) throw new Error(`Encabezados no reconocidos: ${enc.filter(Boolean).join(' | ')}`);

  let creados = 0;
  let actualizados = 0;
  let omitidos = 0;
  const vistos = new Set();
  for (let i = 2; i <= ws.rowCount; i++) {
    const r = ws.getRow(i).values;
    const codigo = texto(r[cCod]);
    const nombre = texto(r[cNom]).toUpperCase();
    const categoria = cCat > 0 ? texto(r[cCat]).toUpperCase() || null : null;
    if (!codigo || !nombre) {
      omitidos++;
      continue;
    }
    if (vistos.has(codigo)) {
      console.warn(`Fila ${i}: código ${codigo} repetido en el Excel, se usa la primera aparición.`);
      omitidos++;
      continue;
    }
    vistos.add(codigo);

    const existente = await prisma.product.findUnique({
      where: { plantId_codigo: { plantId: plant.id, codigo } },
      select: { id: true, nombre: true, categoria: true },
    });
    if (!existente) {
      await prisma.product.create({ data: { plantId: plant.id, codigo, nombre, categoria } });
      creados++;
    } else if (existente.nombre !== nombre || existente.categoria !== categoria) {
      await prisma.product.update({ where: { id: existente.id }, data: { nombre, categoria } });
      actualizados++;
    }
  }

  const total = await prisma.product.count({ where: { plantId: plant.id } });
  console.log(
    `Planta ${plant.code}: ${creados} creados, ${actualizados} actualizados, ${omitidos} omitidos. Total productos: ${total}.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
