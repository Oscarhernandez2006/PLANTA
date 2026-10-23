-- Fila del histórico generada automáticamente desde una orden de beneficio.
ALTER TABLE "historico_beneficio" ADD COLUMN "orden_beneficio_id" UUID;
CREATE UNIQUE INDEX "historico_beneficio_orden_beneficio_id_key" ON "historico_beneficio"("orden_beneficio_id");
