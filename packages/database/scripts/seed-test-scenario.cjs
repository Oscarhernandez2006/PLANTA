// Crea un escenario de prueba: 1 guía ABIERTA en Peso en Camión + 1 animal en
// Peso en Pie (misma guía), para probar que al cerrar la guía se genera la orden.
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function todayDate() {
  const s = new Date().toISOString().slice(0, 10);
  return new Date(`${s}T00:00:00.000Z`);
}

async function main() {
  const date = todayDate();

  const user = await prisma.appUser.findFirst({
    where: { active: true },
    select: { id: true, plantId: true, fullName: true },
  });
  if (!user) throw new Error('No hay usuarios en la BD.');

  const clienteRow = await prisma.cliente.findFirst({
    where: { active: true },
    select: { concepto: true },
  });
  const cliente = clienteRow?.concepto ?? 'CLIENTE PRUEBA';
  const guia = 'TEST-' + Date.now().toString().slice(-6);

  // Referencia de guía (Peso en Camión)
  const aggC = await prisma.pesoCamion.aggregate({
    _max: { reference: true },
    where: { plantId: user.plantId, date, deletedAt: null },
  });
  const refCamion = (aggC._max.reference ?? 0) + 1;

  const camion = await prisma.pesoCamion.create({
    data: {
      plantId: user.plantId,
      reference: refCamion,
      date,
      guia,
      cliente,
      cantidad: 1,
      status: 'abierta',
      createdById: user.id,
    },
    select: { id: true, reference: true, guia: true, cliente: true, status: true },
  });

  // Referencia de Peso en Pie
  const aggP = await prisma.pesoEnPie.aggregate({
    _max: { reference: true },
    where: { plantId: user.plantId, date, deletedAt: null },
  });
  const refPie = (aggP._max.reference ?? 0) + 1;

  const pie = await prisma.pesoEnPie.create({
    data: {
      plantId: user.plantId,
      reference: refPie,
      date,
      guia,
      cliente,
      animalCount: 1,
      createdById: user.id,
    },
    select: { id: true, reference: true, guia: true, cliente: true, animalCount: true },
  });

  console.log('Usuario:', user.fullName);
  console.log('GUIA (Peso en Camión, ABIERTA):', JSON.stringify(camion, null, 2));
  console.log('ANIMAL (Peso en Pie):', JSON.stringify(pie, null, 2));
  console.log(`\n>> Cierra la guía "${guia}" (cliente ${cliente}) en Peso en Camión y la orden aparecerá sola.`);
}

main().catch((e) => { console.error('ERROR:', e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
