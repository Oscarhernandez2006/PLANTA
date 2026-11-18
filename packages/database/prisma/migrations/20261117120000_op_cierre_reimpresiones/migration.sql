-- Cierre de OP autorizado por un supervisor (PIN): fecha y usuario.
ALTER TABLE "production_order" ADD COLUMN IF NOT EXISTS "cerrada_at" TIMESTAMPTZ(6);
ALTER TABLE "production_order" ADD COLUMN IF NOT EXISTS "cerrada_by" UUID;

-- Bitácora de reimpresiones de etiquetas de Rotulado Desposte.
CREATE TABLE IF NOT EXISTS "rotulado_reimpresion" (
  "id" UUID NOT NULL,
  "plant_id" UUID NOT NULL,
  "production_order_id" UUID NOT NULL,
  "tipo" TEXT NOT NULL,
  "codigo" TEXT NOT NULL,
  "etiqueta_id" UUID,
  "canastilla_id" UUID,
  "estacion" TEXT,
  "user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "rotulado_reimpresion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "rotulado_reimpresion_production_order_id_idx" ON "rotulado_reimpresion"("production_order_id");
