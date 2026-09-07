import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Reset: elimina TODOS los datos en orden seguro respecto de las FKs.
  // Los triggers de auditoría se disparan al borrar goods_receipt(_item);
  // por eso las tablas *_audit se limpian al final.
  await prisma.traceLink.deleteMany();
  await prisma.traceEvent.deleteMany();
  await prisma.traceUnit.deleteMany();
  await prisma.dispatchOrder.deleteMany();
  await prisma.packageItem.deleteMany();
  await prisma.shipmentItem.deleteMany();
  await prisma.shipment.deleteMany();
  await prisma.cut.deleteMany();
  await prisma.cuttingRecord.deleteMany();
  await prisma.cuttingOrder.deleteMany();
  await prisma.package.deleteMany();
  await prisma.goodsReceiptItem.deleteMany();
  await prisma.goodsReceipt.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.client.deleteMany();
  await prisma.appUser.deleteMany();
  await prisma.productType.deleteMany();
  await prisma.plant.deleteMany();
  await prisma.goodsReceiptItemAudit.deleteMany();
  await prisma.goodsReceiptAudit.deleteMany();

  // Único registro técnico de planta (contenedor del usuario; editable luego).
  const plant = await prisma.plant.create({
    data: { code: 'PL-001', legalName: 'Planta principal' },
  });

  const pinHash = await bcrypt.hash('6409', 10);
  const user = await prisma.appUser.create({
    data: {
      plantId: plant.id,
      email: 'u1044616409@planta.local',
      passwordHash: 'NO_USADO',
      pinHash,
      documentId: '1044616409',
      fullName: 'Oscar Hernández',
      role: 'admin',
    },
  });

  // Cliente demo (a futuro se sincroniza desde el ERP).
  const client = await prisma.client.create({
    data: { nit: '123456789', name: 'Prueba Proceso', sede: 'Principal' },
  });

  console.log('Reset completado. Base de datos limpia.');
  console.log(`  plantId = ${plant.id}`);
  console.log(`  userId  = ${user.id}`);
  console.log(`  clientId = ${client.id}`);
  console.log('  Login -> cédula 1044616409 / PIN 6409');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
