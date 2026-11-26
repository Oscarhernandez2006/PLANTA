-- Despacho posta al cliente con tiendas: una remisión por pre-orden, cada una en la guía de su camión.
ALTER TABLE "dispatch_product_item" ADD COLUMN "picking_id" UUID;
ALTER TABLE "picking" ADD COLUMN "guia_transporte_id" UUID, ADD COLUMN "remision_numero" INTEGER;

CREATE INDEX "dispatch_product_item_picking_id_idx" ON "dispatch_product_item"("picking_id");
CREATE INDEX "picking_guia_transporte_id_idx" ON "picking"("guia_transporte_id");

ALTER TABLE "dispatch_product_item" ADD CONSTRAINT "dispatch_product_item_picking_id_fkey"
  FOREIGN KEY ("picking_id") REFERENCES "picking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "picking" ADD CONSTRAINT "picking_guia_transporte_id_fkey"
  FOREIGN KEY ("guia_transporte_id") REFERENCES "guia_transporte"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Lo ya despachado queda en la pre-orden donde se alistó.
UPDATE "dispatch_product_item" d
SET "picking_id" = pi."picking_id"
FROM "picking_item" pi
JOIN "picking" p ON p."id" = pi."picking_id"
WHERE pi."codigo" = d."codigo"
  AND p."canal_dispatch_order_id" = d."canal_dispatch_order_id"
  AND d."picking_id" IS NULL;
