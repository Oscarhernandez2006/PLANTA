-- OS No. es el consecutivo propio de la O.P., no una orden de beneficio.
ALTER TABLE "orden_proceso" DROP CONSTRAINT "orden_proceso_orden_beneficio_id_fkey";
ALTER TABLE "orden_proceso" DROP COLUMN "orden_beneficio_id";
