// Borra TODA la información transaccional (pruebas) dejando intactos los
// catálogos (clientes, proveedores, procedencias, conductores, productos),
// usuarios/operarios y equipos registrados. Pensado para dejar la BD lista
// antes de salir a producción. Uso: node packages/database/scripts/reset-produccion.cjs
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.$transaction([
    // Canal Caliente / Subproductos / Órdenes de beneficio (de más hijo a más padre)
    prisma.canalTraslado.deleteMany(),
    prisma.canalPieza.deleteMany(),
    prisma.subproductoItem.deleteMany(),
    prisma.ordenBeneficioEvento.deleteMany(),
    prisma.ordenBeneficio.deleteMany(),

    // Insensibilización (legado) / Peso en Pie
    prisma.insensibilizacionEvento.deleteMany(),
    prisma.insensibilizacion.deleteMany(),
    prisma.pesoEnPie.deleteMany(),

    // Peso en Camión
    prisma.pesoCamion.deleteMany(),

    // Recibo en Posta / Recibo en Canal
    prisma.postaReceiptItem.deleteMany(),
    prisma.postaReceiptOrder.deleteMany(),
    prisma.canalReceiptItem.deleteMany(),
    prisma.canalReceiptOrder.deleteMany(),

    // Despacho
    prisma.dispatchOrder.deleteMany(),

    // Ingreso de mercancía + auditoría
    prisma.goodsReceiptItem.deleteMany(),
    prisma.goodsReceipt.deleteMany(),
    prisma.goodsReceiptAudit.deleteMany(),
    prisma.goodsReceiptItemAudit.deleteMany(),

    // Trazabilidad
    prisma.traceUnit.deleteMany(),
    prisma.traceEvent.deleteMany(),
  ]);

  console.log(
    'Listo: se borraron todas las transacciones. Catálogos (clientes, proveedores, procedencias, conductores, productos), usuarios y equipos quedaron intactos.',
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
