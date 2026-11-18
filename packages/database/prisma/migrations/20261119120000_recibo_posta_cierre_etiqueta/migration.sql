ALTER TABLE "posta_receipt_order"
  ADD COLUMN IF NOT EXISTS "cerrada_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "cerrada_by" UUID;

ALTER TABLE "posta_receipt_item"
  ADD COLUMN IF NOT EXISTS "piezas" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "empaques" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lote" TEXT,
  ADD COLUMN IF NOT EXISTS "conservacion" TEXT,
  ADD COLUMN IF NOT EXISTS "fecha_sacrificio" DATE,
  ADD COLUMN IF NOT EXISTS "fecha_vencimiento" DATE;

CREATE TABLE IF NOT EXISTS "posta_receipt_reimpresion" (
  "id" UUID NOT NULL,
  "plant_id" UUID NOT NULL,
  "receipt_order_id" UUID NOT NULL,
  "item_id" UUID NOT NULL,
  "estacion" TEXT,
  "user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "posta_receipt_reimpresion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "posta_receipt_reimpresion_receipt_order_id_idx"
  ON "posta_receipt_reimpresion"("receipt_order_id");
