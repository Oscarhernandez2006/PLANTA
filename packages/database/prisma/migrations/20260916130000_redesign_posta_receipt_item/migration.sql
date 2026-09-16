-- REGISTRO en Recibo en Posta: ahora se captura producto + tara/bruto/neto (no cava).
ALTER TABLE "posta_receipt_item" DROP CONSTRAINT IF EXISTS "posta_receipt_item_created_by_fkey";
ALTER TABLE "posta_receipt_item" DROP CONSTRAINT IF EXISTS "posta_receipt_item_plant_id_fkey";
ALTER TABLE "posta_receipt_item" DROP CONSTRAINT IF EXISTS "posta_receipt_item_receipt_order_id_fkey";

ALTER TABLE "posta_receipt_item"
  DROP COLUMN "cava",
  DROP COLUMN "peso_kg",
  DROP COLUMN "guia",
  DROP COLUMN "lote",
  DROP COLUMN "identificacion",
  ADD COLUMN "product_id" UUID NOT NULL,
  ADD COLUMN "tara_kg" DECIMAL(12,2) NOT NULL,
  ADD COLUMN "bruto_kg" DECIMAL(12,2) NOT NULL,
  ADD COLUMN "neto_kg" DECIMAL(12,2) NOT NULL;

ALTER TABLE "posta_receipt_item" ADD CONSTRAINT "posta_receipt_item_receipt_order_id_fkey" FOREIGN KEY ("receipt_order_id") REFERENCES "posta_receipt_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "posta_receipt_item" ADD CONSTRAINT "posta_receipt_item_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "posta_receipt_item" ADD CONSTRAINT "posta_receipt_item_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "posta_receipt_item" ADD CONSTRAINT "posta_receipt_item_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
