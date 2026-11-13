// Borra TODOS los datos de MOVIMIENTOS (pesos, órdenes, sacrificio, canales,
// pieles/subproductos, recibos, rotulado, despachos, traslados, inventario y
// trazabilidad) y reinicia sus consecutivos y el contador de códigos de barras.
//
// Conserva los CATÁLOGOS: plant, app_user, cliente, cliente_producto,
// cliente_tienda, client, product, bodega, conductor, procedencia, proveedor,
// supplier, historico_tarifa, historico_tarifa_subproducto; y el histórico
// importado del Excel (solo quita las filas generadas desde órdenes).
//
// DESTRUCTIVO: pedir confirmación explícita del usuario antes de ejecutarlo.
// Uso: node packages/database/scripts/reset-transactional-data.cjs [--yes]
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const TABLES = [
  'servicio_manual',
  // Despachos / traslados / inventario
  'canal_dispatch_order_item',
  'canal_dispatch_order',
  'dispatch_product_item',
  'dispatch_order_item',
  'dispatch_order',
  'transfer_order_item',
  'transfer_order',
  'bodega_transfer_item',
  'bodega_transfer',
  'conditioning_order',
  'production_order_tienda',
  'production_order',
  // Rotulado
  'acondicionamiento_etiqueta',
  'rotulado_etiqueta',
  'rotulado_canastilla',
  'rotulado_consecutivo_estacion',
  'rotulado_consecutivo',
  'codigo_barras_secuencia',
  // Recibos
  'goods_receipt_item_audit',
  'goods_receipt_audit',
  'goods_receipt_item',
  'goods_receipt',
  'canal_receipt_item',
  'canal_receipt_order',
  'posta_receipt_item',
  'posta_receipt_order',
  // Beneficio
  'canal_traslado',
  'canal_pieza',
  'subproducto_item',
  'orden_beneficio_evento',
  'costo_ganado',
  'orden_beneficio',
  'insensibilizacion_evento',
  'insensibilizacion',
  'peso_en_pie_repesaje',
  'peso_en_pie',
  'peso_camion',
  // Trazabilidad
  'trace_event',
  'trace_unit',
];

async function main() {
  if (!process.argv.includes('--yes')) {
    console.error('Este script borra todos los movimientos. Ejecútalo con --yes para confirmar.');
    process.exit(2);
  }
  // Solo trunca las que existan en la BD (tolera esquemas viejos/nuevos).
  const existentes = await prisma.$queryRawUnsafe(
    `select tablename from pg_tables where schemaname = 'public'`,
  );
  const set = new Set(existentes.map((r) => r.tablename));
  const faltan = TABLES.filter((t) => !set.has(t));
  const tablas = TABLES.filter((t) => set.has(t));
  if (faltan.length) console.warn('No existen (se omiten):', faltan.join(', '));

  // CASCADE vaciaría también cualquier tabla con FK hacia estas: se aborta si hay alguna fuera de la lista.
  const dependientes = await prisma.$queryRawUnsafe(
    `select distinct c.conrelid::regclass::text as tabla, c.confrelid::regclass::text as referencia
       from pg_constraint c
      where c.contype = 'f' and c.confrelid::regclass::text = any($1) and not (c.conrelid::regclass::text = any($1))`,
    tablas,
  );
  if (dependientes.length) {
    console.error('Tablas fuera de la lista dependen de las que se vaciarían:', dependientes);
    process.exit(1);
  }

  const sql = `TRUNCATE TABLE ${tablas.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE;`;
  await prisma.$transaction([
    prisma.$executeRawUnsafe(sql),
    prisma.$executeRawUnsafe('DELETE FROM "historico_beneficio" WHERE "orden_beneficio_id" IS NOT NULL'),
  ]);
  console.log(`Truncadas ${tablas.length} tablas de movimientos. Consecutivos reiniciados.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
