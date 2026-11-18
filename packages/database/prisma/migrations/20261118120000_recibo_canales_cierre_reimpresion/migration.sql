-- Cierre del recibo de canales con PIN de supervisor.
ALTER TABLE "canal_receipt_order" ADD COLUMN IF NOT EXISTS "cerrada_at" TIMESTAMPTZ(6);
ALTER TABLE "canal_receipt_order" ADD COLUMN IF NOT EXISTS "cerrada_by" UUID;

-- Bitácora de reimpresiones de rótulos del recibo.
CREATE TABLE IF NOT EXISTS "canal_receipt_reimpresion" (
  "id" UUID NOT NULL,
  "plant_id" UUID NOT NULL,
  "receipt_order_id" UUID NOT NULL,
  "item_id" UUID NOT NULL,
  "estacion" TEXT,
  "user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "canal_receipt_reimpresion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "canal_receipt_reimpresion_receipt_order_id_idx" ON "canal_receipt_reimpresion"("receipt_order_id");
