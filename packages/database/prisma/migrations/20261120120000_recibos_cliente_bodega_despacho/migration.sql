-- Los recibos usan el maestro de clientes del software (cliente); la tabla client queda sin uso.
-- Las órdenes de recibo existentes (si las hay) se borran: client no tenía registros.
DELETE FROM "canal_receipt_item";
DELETE FROM "canal_receipt_order";
DELETE FROM "posta_receipt_item";
DELETE FROM "posta_receipt_order";

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tc.table_name, tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage k
      ON k.constraint_name = tc.constraint_name AND k.table_name = tc.table_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_name IN ('canal_receipt_order', 'posta_receipt_order')
      AND k.column_name = 'client_id'
  LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', r.table_name, r.constraint_name);
  END LOOP;
END $$;

ALTER TABLE "canal_receipt_order" RENAME COLUMN "client_id" TO "cliente_id";
ALTER TABLE "posta_receipt_order" RENAME COLUMN "client_id" TO "cliente_id";

ALTER TABLE "canal_receipt_order"
  ADD COLUMN IF NOT EXISTS "bodega_id" UUID,
  ADD CONSTRAINT "canal_receipt_order_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "canal_receipt_order_bodega_id_fkey" FOREIGN KEY ("bodega_id") REFERENCES "bodega"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "posta_receipt_order"
  ADD COLUMN IF NOT EXISTS "bodega_id" UUID,
  ADD CONSTRAINT "posta_receipt_order_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "posta_receipt_order_bodega_id_fkey" FOREIGN KEY ("bodega_id") REFERENCES "bodega"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Salida de canales recibidas por OD (Canal Fría) o DC (despacho caliente/frío).
ALTER TABLE "canal_receipt_item"
  ADD COLUMN IF NOT EXISTS "dispatch_order_id" UUID,
  ADD COLUMN IF NOT EXISTS "canal_dispatch_order_id" UUID,
  ADD COLUMN IF NOT EXISTS "despacho_kg" DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "despachado_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "despachado_by" UUID,
  ADD CONSTRAINT "canal_receipt_item_dispatch_order_id_fkey" FOREIGN KEY ("dispatch_order_id") REFERENCES "dispatch_order"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "canal_receipt_item_canal_dispatch_order_id_fkey" FOREIGN KEY ("canal_dispatch_order_id") REFERENCES "canal_dispatch_order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "canal_receipt_item_dispatch_order_id_idx" ON "canal_receipt_item"("dispatch_order_id");
CREATE INDEX IF NOT EXISTS "canal_receipt_item_canal_dispatch_order_id_idx" ON "canal_receipt_item"("canal_dispatch_order_id");

-- Salida de producto recibido en posta por DC posta.
ALTER TABLE "dispatch_product_item"
  ADD COLUMN IF NOT EXISTS "posta_item_id" UUID,
  ADD CONSTRAINT "dispatch_product_item_posta_item_id_fkey" FOREIGN KEY ("posta_item_id") REFERENCES "posta_receipt_item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS "dispatch_product_item_posta_item_id_key" ON "dispatch_product_item"("posta_item_id");
