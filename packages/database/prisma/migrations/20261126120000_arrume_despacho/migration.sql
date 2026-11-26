-- Arrumes del despacho posta / traslado: se pesa el arrume completo y luego se pistolean sus
-- canastillas; la diferencia neto báscula vs. neto etiquetas no puede superar 1 kg.
CREATE TABLE IF NOT EXISTS "arrume" (
    "id" UUID NOT NULL,
    "plant_id" UUID NOT NULL,
    "canal_dispatch_order_id" UUID,
    "transfer_order_id" UUID,
    "peso_bruto_kg" DECIMAL(12,2) NOT NULL,
    "tara_canastilla_kg" DECIMAL(8,2) NOT NULL,
    "tara_estiba_kg" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "terminado_at" TIMESTAMPTZ(6),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "arrume_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "arrume_canal_dispatch_order_id_idx" ON "arrume"("canal_dispatch_order_id");
CREATE INDEX IF NOT EXISTS "arrume_transfer_order_id_idx" ON "arrume"("transfer_order_id");
-- Un solo arrume abierto por orden.
CREATE UNIQUE INDEX IF NOT EXISTS "arrume_abierto_dc_key" ON "arrume"("canal_dispatch_order_id") WHERE "terminado_at" IS NULL AND "canal_dispatch_order_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "arrume_abierto_ot_key" ON "arrume"("transfer_order_id") WHERE "terminado_at" IS NULL AND "transfer_order_id" IS NOT NULL;

DO $$ BEGIN
  ALTER TABLE "arrume" ADD CONSTRAINT "arrume_canal_dispatch_order_id_fkey"
    FOREIGN KEY ("canal_dispatch_order_id") REFERENCES "canal_dispatch_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "arrume" ADD CONSTRAINT "arrume_transfer_order_id_fkey"
    FOREIGN KEY ("transfer_order_id") REFERENCES "transfer_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "dispatch_product_item" ADD COLUMN IF NOT EXISTS "arrume_id" UUID;
ALTER TABLE "transfer_order_item" ADD COLUMN IF NOT EXISTS "arrume_id" UUID;
DO $$ BEGIN
  ALTER TABLE "dispatch_product_item" ADD CONSTRAINT "dispatch_product_item_arrume_id_fkey"
    FOREIGN KEY ("arrume_id") REFERENCES "arrume"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "transfer_order_item" ADD CONSTRAINT "transfer_order_item_arrume_id_fkey"
    FOREIGN KEY ("arrume_id") REFERENCES "arrume"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
