// Importa al Histórico Sacrificio la hoja BENEFICIO y la tabla de tarifas
// (hoja TARIFAS, columnas CLIENTE / VALOR BASE) del Excel "BENEFICIO BOVINOS".
// Uso: node scripts/import-historico-beneficio.cjs "<archivo.xlsx>" [--reemplazar]
// Sin --reemplazar no hace nada si el histórico ya tiene filas.
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const ExcelJS = require(require.resolve('exceljs', { paths: [path.join(__dirname, '../../../apps/web')] }));

const prisma = new PrismaClient();

function valor(v) {
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    if ('result' in v) return v.result;
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
    if ('text' in v) return v.text;
  }
  return v;
}

function texto(v) {
  v = valor(v);
  if (v == null) return null;
  const s = String(v).trim().replace(/\s+/g, ' ');
  return s === '' ? null : s.toUpperCase();
}

function numero(v) {
  v = valor(v);
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function entero(v) {
  const n = numero(v);
  return n == null ? 0 : Math.round(n);
}

async function main() {
  const [archivo, ...flags] = process.argv.slice(2);
  if (!archivo) throw new Error('Uso: import-historico-beneficio.cjs <archivo.xlsx> [--reemplazar]');
  const reemplazar = flags.includes('--reemplazar');

  const plants = await prisma.plant.findMany({ select: { id: true } });
  if (plants.length !== 1) throw new Error(`Se esperaba 1 planta y hay ${plants.length}.`);
  const plantId = plants[0].id;

  const existentes = await prisma.historicoBeneficio.count({ where: { plantId } });
  if (existentes && !reemplazar) {
    throw new Error(`El histórico ya tiene ${existentes} filas. Usa --reemplazar para cargarlo de nuevo.`);
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.resolve(archivo));

  // Tarifas: hoja TARIFAS, columnas A (CLIENTE) y B (VALOR BASE).
  const wsT = wb.getWorksheet('TARIFAS');
  const tarifas = new Map();
  for (let i = 2; i <= wsT.rowCount; i++) {
    const cliente = texto(wsT.getRow(i).getCell(1).value);
    const base = numero(wsT.getRow(i).getCell(2).value);
    if (cliente && base != null) tarifas.set(cliente, base);
  }

  // Beneficio: A semana (fórmula), B fecha, C..I texto/lote, J..N reses,
  // O total (fórmula), P pieles, Q peso pie, R peso caliente, U tarifa.
  const ws = wb.getWorksheet('BENEFICIO');
  const filas = [];
  for (let i = 2; i <= ws.rowCount; i++) {
    const r = ws.getRow(i);
    const fecha = valor(r.getCell(2).value);
    if (!(fecha instanceof Date)) continue;
    const lote = numero(r.getCell(9).value);
    filas.push({
      plantId,
      fecha: new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate())),
      proveedor: texto(r.getCell(3).value),
      firmador: texto(r.getCell(4).value),
      cliente: texto(r.getCell(5).value),
      granja: texto(r.getCell(6).value),
      municipio: texto(r.getCell(7).value),
      guiaIca: texto(r.getCell(8).value),
      lote: lote == null ? null : Math.round(lote),
      novillo: entero(r.getCell(10).value),
      novilla: entero(r.getCell(11).value),
      vaca: entero(r.getCell(12).value),
      toro: entero(r.getCell(13).value),
      bufalo: entero(r.getCell(14).value),
      pieles: numero(r.getCell(16).value) == null ? null : entero(r.getCell(16).value),
      pesoPieKg: numero(r.getCell(17).value),
      pesoCalienteKg: numero(r.getCell(18).value),
      tarifa: numero(r.getCell(21).value),
    });
  }

  await prisma.$transaction(
    async (tx) => {
      if (reemplazar) {
        await tx.historicoBeneficio.deleteMany({ where: { plantId } });
        await tx.historicoTarifa.deleteMany({ where: { plantId } });
      }
      await tx.historicoTarifa.createMany({
        data: [...tarifas].map(([cliente, valorBase]) => ({ plantId, cliente, valorBase })),
      });
      for (let i = 0; i < filas.length; i += 500) {
        await tx.historicoBeneficio.createMany({ data: filas.slice(i, i + 500) });
      }
    },
    { timeout: 120000 },
  );

  const reses = filas.reduce((s, f) => s + f.novillo + f.novilla + f.vaca + f.toro + f.bufalo, 0);
  console.log(`Tarifas: ${tarifas.size}`);
  console.log(`Filas de beneficio: ${filas.length} (${reses} reses)`);
  console.log(`Desde ${filas[0]?.fecha.toISOString().slice(0, 10)} hasta ${filas.at(-1)?.fecha.toISOString().slice(0, 10)}`);
}

main()
  .catch((e) => {
    console.error(e.message ?? e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
