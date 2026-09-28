// Borra TODOS los datos transaccionales (pesos, órdenes, recibos, eventos,
// auditorías, trazabilidad) y reinicia sus consecutivos, dejando intactos los
// catálogos: plantas, usuarios, clientes, proveedores, procedencias,
// conductores, productos, dispositivos y clientes (client/dispatch).
// Uso: node packages/database/scripts/reset-transactional-data.cjs
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const TABLES = [
  'canal_traslado',
  'canal_pieza',
  'subproducto_item',
  'orden_beneficio_evento',
  'orden_beneficio',
  'insensibilizacion_evento',
  'insensibilizacion',
  'peso_en_pie',
  'peso_camion',
  'trace_event',
  'trace_unit',
  'goods_receipt_item_audit',
  'goods_receipt_audit',
  'goods_receipt_item',
  'goods_receipt',
  'canal_receipt_item',
  'canal_receipt_order',
  'posta_receipt_item',
  'posta_receipt_order',
  'dispatch_order',
];

async function main() {
  const sql = `TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE;`;
  await prisma.$executeRawUnsafe(sql);
  console.log(`Truncadas ${TABLES.length} tablas transaccionales. Consecutivos reiniciados.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
