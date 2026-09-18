-- Traslado de canales entre cavas: trazabilidad de quién, cuándo, de dónde a
-- dónde y por qué motivo se movió una canal.
CREATE TABLE "canal_traslado" (
    "id" UUID NOT NULL,
    "plant_id" UUID NOT NULL,
    "orden_beneficio_evento_id" UUID NOT NULL,
    "cava_origen" TEXT,
    "cava_destino" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "operator_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "canal_traslado_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "canal_traslado_orden_beneficio_evento_id_idx" ON "canal_traslado"("orden_beneficio_evento_id");
CREATE INDEX "canal_traslado_plant_id_created_at_idx" ON "canal_traslado"("plant_id", "created_at");

ALTER TABLE "canal_traslado" ADD CONSTRAINT "canal_traslado_orden_beneficio_evento_id_fkey"
  FOREIGN KEY ("orden_beneficio_evento_id") REFERENCES "orden_beneficio_evento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
