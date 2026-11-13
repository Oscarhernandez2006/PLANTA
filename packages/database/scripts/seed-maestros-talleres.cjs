// Valores iniciales de los talleres (tomados de la mini-app de talleres): lista de
// precios general en cero, tarifas de proceso y reglas de retoma por corte.
// Solo crea lo que no existe; se puede correr varias veces.
// Uso: node scripts/seed-maestros-talleres.cjs
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const DESDE = new Date('2026-01-01T00:00:00Z');

const TARIFAS_GENERALES = [
  ['desposte', 'DESPOSTE', 'kg_frio', 400],
  ['inyeccion', 'INYECCION', 'kg_entrada', 1217],
  ['caja', 'CAJA', 'unidad', 8560],
  ['porcionado', 'PORCIONADO', 'kg', 811],
  ['porcionado', 'PORCIONADO ESPECIAL', 'kg', 988],
  ['bolsa', '8X24', 'unidad', 2212],
  ['bolsa', '10X16', 'unidad', 2075],
  ['bolsa', '12X16', 'unidad', 1792],
  ['bolsa', '8X12', 'unidad', 1625],
  ['bolsa', '16X26', 'unidad', 3705],
  ['bolsa', '13X24', 'unidad', 2538],
  ['bolsa', '8X18', 'unidad', 1892],
  ['bolsa', '8X24HUESO', 'unidad', 3026],
  ['bolsa', '13X12HUESO', 'unidad', 2700],
  ['termoformado', 'TERMOFORMADO 2X2', 'unidad', 741],
  ['termoformado', 'TERMOFORMADO 3X1', 'unidad', 865],
  ['termoformado', 'TERMOFORMADO 3X1 HUESO', 'unidad', 1235],
  ['termoformado', 'TERMOFORMADO 3X2', 'unidad', 556],
  ['etiqueta', 'LIQ ETIQUETAS MED', 'unidad', 548],
  ['etiqueta', 'LIQ ETIQUETAS PEQ', 'unidad', 542],
];

// Éxito: empaque por kg empacado en lugar de bolsas por unidad, piking y congelación.
const TARIFAS_EXITO = [
  ['desposte', 'DESPOSTE', 'kg_frio', 680],
  ['empaque', 'EMPAQUE', 'kg_empacado', 750],
  ['servicio', 'PIKING', 'kg', 65],
  ['servicio', 'CONGELACION', 'kg', 76],
  ['empaque', 'BOLSATINAS', 'unidad', 180],
  ['servicio', 'CANASTILLA', 'unidad', 1586],
];

const RETOMAS = ['CHOCOZUELA', 'DECOMISO', 'GRASA DE PECHO', 'HUESO BLANCO', 'HUESO ECONOMICO CONG', 'HUESO NEGRO CONGELADO', 'OMBLIGO', 'SEBO'];
const RETOMA_EXITO_CODIGOS = ['1351', '1607', '1621', '3247', '1665', '17003'];
const normalizar = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

async function main() {
  const plants = await prisma.plant.findMany({ select: { id: true } });
  if (plants.length !== 1) throw new Error(`Se esperaba 1 planta y hay ${plants.length}.`);
  const plantId = plants[0].id;
  const user = await prisma.appUser.findFirstOrThrow({ where: { plantId }, orderBy: { createdAt: 'asc' }, select: { id: true } });
  const productos = await prisma.product.findMany({ where: { plantId, active: true }, select: { id: true, codigo: true, nombre: true } });
  const exito =
    (await prisma.cliente.findFirst({ where: { nit: '890900608' }, select: { id: true, concepto: true } })) ??
    (await prisma.cliente.findFirst({ where: { concepto: { contains: 'EXITO' } }, select: { id: true, concepto: true } }));

  if (!(await prisma.precioLista.count({ where: { plantId } }))) {
    await prisma.precioLista.create({
      data: {
        plantId,
        nombre: 'LISTA GENERAL INICIAL',
        vigenteDesde: DESDE,
        observaciones: 'Precios en cero: cargar la lista de precios vigente.',
        createdById: user.id,
        items: { createMany: { data: productos.map((p) => ({ productId: p.id, precioKg: 0 })) } },
      },
    });
    console.log(`Lista de precios inicial: ${productos.length} productos en cero.`);
  }

  if (!(await prisma.tarifaProceso.count({ where: { plantId } }))) {
    const filas = TARIFAS_GENERALES.map(([categoria, concepto, base, valor]) => ({ clienteId: null, categoria, concepto, base, valor }));
    if (exito) filas.push(...TARIFAS_EXITO.map(([categoria, concepto, base, valor]) => ({ clienteId: exito.id, categoria, concepto, base, valor })));
    await prisma.tarifaProceso.createMany({
      data: filas.map((f) => ({ ...f, plantId, vigenteDesde: DESDE, createdById: user.id })),
    });
    console.log(`Tarifas: ${TARIFAS_GENERALES.length} generales${exito ? ` y ${TARIFAS_EXITO.length} de ${exito.concepto}` : ''}.`);
  }

  if (!(await prisma.reglaCorte.count({ where: { plantId } }))) {
    const generales = productos.filter((p) => RETOMAS.includes(normalizar(p.nombre)));
    await prisma.reglaCorte.createMany({ data: generales.map((p) => ({ plantId, productId: p.id, retoma: true })) });
    let deExito = [];
    if (exito) {
      deExito = productos.filter((p) => RETOMA_EXITO_CODIGOS.includes(p.codigo) || RETOMAS.includes(normalizar(p.nombre)));
      await prisma.reglaCorte.createMany({ data: deExito.map((p) => ({ plantId, clienteId: exito.id, productId: p.id, retoma: true })) });
    }
    console.log(`Reglas de retoma: ${generales.length} generales${exito ? `, ${deExito.length} de ${exito.concepto}` : ''}.`);
  }
}

main()
  .catch((e) => {
    console.error(e.message ?? e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
