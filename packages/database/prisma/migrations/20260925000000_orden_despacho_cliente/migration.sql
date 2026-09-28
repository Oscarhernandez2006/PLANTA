-- La "Orden de Proceso" era en realidad la Orden de Despacho: se elimina (estaba vacía).
DROP TABLE "orden_proceso";
DROP TYPE "OrdenProcesoTipo";
DROP TYPE "OrdenProcesoStatus";

-- La Orden de Despacho usa el catálogo de Clientes (tabla cliente). Estaba vacía.
ALTER TABLE "dispatch_order" DROP CONSTRAINT "dispatch_order_client_id_fkey";
ALTER TABLE "dispatch_order" DROP COLUMN "client_id";
ALTER TABLE "dispatch_order" ADD COLUMN "cliente_id" UUID NOT NULL;
ALTER TABLE "dispatch_order" ADD CONSTRAINT "dispatch_order_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
