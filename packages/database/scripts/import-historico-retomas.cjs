// Importa al Histórico Sacrificio la hoja RETOMAS y la tabla de tarifas de
// subproductos (hoja TARIFAS, columnas D:J) del Excel "BENEFICIO BOVINOS".
// Uso: node scripts/import-historico-retomas.cjs "<archivo.xlsx>" [--reemplazar]
// Sin --reemplazar no hace nada si ya hay retomas cargadas.
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

function texto(v) {
  v = valor(v);
  if (v == null) return null;
  const s = String(v).trim().replace(/\s+/g, ' ');
  return s === '' ? null : s.toUpperCase();
}

/** Número o null (celdas vacías, con espacios o con #VALUE!). */
function numero(v) {
  v = valor(v);
  if (v == null || (typeof v === 'string' && !v.trim())) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const entero = (v) => {
  const n = numero(v);
  return n == null ? null : Math.round(n);
};

async function main() {
  const [archivo, ...flags] = process.argv.slice(2);
  if (!archivo) throw new Error('Uso: import-historico-retomas.cjs <archivo.xlsx> [--reemplazar]');
  const reemplazar = flags.includes('--reemplazar');

  const plants = await prisma.plant.findMany({ select: { id: true } });
  if (plants.length !== 1) throw new Error(`Se esperaba 1 planta y hay ${plants.length}.`);
  const plantId = plants[0].id;

  const existentes = await prisma.historicoRetoma.count({ where: { plantId } });
  if (existentes && !reemplazar) {
    throw new Error(`Ya hay ${existentes} retomas cargadas. Usa --reemplazar para cargarlas de nuevo.`);
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.resolve(archivo));

  // Tarifas de subproductos: D CLIENTES, E CABEZAS, F DESPOJOS, G LIBROS,
  // H PIELES, I SEBO, J VISCERA ROJA.
  const wsT = wb.getWorksheet('TARIFAS');
  const tarifas = [];
  for (let i = 2; i <= wsT.rowCount; i++) {
    const r = wsT.getRow(i);
    const cliente = texto(r.getCell(4).value);
    if (!cliente) continue;
    tarifas.push({
      plantId,
      cliente,
      cabezas: numero(r.getCell(5).value) ?? 0,
      despojos: numero(r.getCell(6).value) ?? 0,
      libros: numero(r.getCell(7).value) ?? 0,
      pieles: numero(r.getCell(8).value) ?? 0,
      sebo: numero(r.getCell(9).value) ?? 0,
      viscerasRojas: numero(r.getCell(10).value) ?? 0,
    });
  }

  // Retomas: A fecha, B firmador, C reses, D cabezas, E despojos, F libros,
  // G pieles (kg), H vísceras rojas, I sebo (kg), J..O valores unitarios.
  const ws = wb.getWorksheet('RETOMAS');
  const filas = [];
  for (let i = 2; i <= ws.rowCount; i++) {
    const r = ws.getRow(i);
    const fecha = valor(r.getCell(1).value);
    if (!(fecha instanceof Date) || !texto(r.getCell(2).value)) continue;
    filas.push({
      plantId,
      fecha: new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate())),
      firmador: texto(r.getCell(2).value),
      reses: entero(r.getCell(3).value) ?? 0,
      cabezas: entero(r.getCell(4).value),
      despojos: entero(r.getCell(5).value),
      libros: entero(r.getCell(6).value),
      pielesKg: numero(r.getCell(7).value),
      viscerasRojas: entero(r.getCell(8).value),
      seboKg: numero(r.getCell(9).value),
      valorCabezas: numero(r.getCell(10).value) ?? 0,
      valorDespojos: numero(r.getCell(11).value) ?? 0,
      valorLibros: numero(r.getCell(12).value) ?? 0,
      valorPieles: numero(r.getCell(13).value) ?? 0,
      valorViscerasRojas: numero(r.getCell(14).value) ?? 0,
      valorSebo: numero(r.getCell(15).value) ?? 0,
    });
  }

  await prisma.$transaction(
    async (tx) => {
      if (reemplazar) {
        await tx.historicoRetoma.deleteMany({ where: { plantId } });
        await tx.historicoTarifaSubproducto.deleteMany({ where: { plantId } });
      }
      await tx.historicoTarifaSubproducto.createMany({ data: tarifas });
      for (let i = 0; i < filas.length; i += 500) {
        await tx.historicoRetoma.createMany({ data: filas.slice(i, i + 500) });
      }
    },
    { timeout: 120000 },
  );

  const reses = filas.reduce((s, f) => s + f.reses, 0);
  console.log(`Tarifas de subproductos: ${tarifas.length}`);
  console.log(`Retomas: ${filas.length} (${reses} reses)`);
  console.log(`Desde ${filas[0]?.fecha.toISOString().slice(0, 10)} hasta ${filas.at(-1)?.fecha.toISOString().slice(0, 10)}`);
}

main()
  .catch((e) => {
    console.error(e.message ?? e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
