-- El cliente de la O.P. es el due\u00f1o de las canales en cava (nombre de Orden de Beneficio + NIT).
ALTER TABLE "orden_proceso" DROP CONSTRAINT "orden_proceso_client_id_fkey";
ALTER TABLE "orden_proceso" DROP COLUMN "client_id";
ALTER TABLE "orden_proceso" ADD COLUMN "cliente" TEXT NOT NULL;
ALTER TABLE "orden_proceso" ADD COLUMN "cliente_nit" TEXT;
