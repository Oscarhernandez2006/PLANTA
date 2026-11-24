-- Pre-órdenes: una orden (posta o traslado) puede tener varias, una por tienda / orden de
-- compra del cliente, con los kilos pedidos por producto. Reemplaza customer_purchase_order.
DROP TABLE IF EXISTS "customer_purchase_order_line";
DROP TABLE IF EXISTS "customer_purchase_order";

DROP INDEX IF EXISTS "picking_canal_dispatch_order_id_key";
DROP INDEX IF EXISTS "picking_transfer_order_id_key";

ALTER TABLE "picking"
  ADD COLUMN IF NOT EXISTS "oc_numero" TEXT,
  ADD COLUMN IF NOT EXISTS "tienda_codigo" TEXT,
  ADD COLUMN IF NOT EXISTS "tienda_nombre" TEXT,
  ADD COLUMN IF NOT EXISTS "observaciones" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "picking_canal_dispatch_order_id_oc_numero_key" ON "picking"("canal_dispatch_order_id", "oc_numero");
CREATE UNIQUE INDEX IF NOT EXISTS "picking_transfer_order_id_oc_numero_key" ON "picking"("transfer_order_id", "oc_numero");

CREATE TABLE IF NOT EXISTS "picking_linea" (
    "id" UUID NOT NULL,
    "picking_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "plu" TEXT,
    "producto_cliente" TEXT,
    "kg_pedidos" DECIMAL(12,2) NOT NULL,
    CONSTRAINT "picking_linea_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "picking_linea_picking_id_fkey" FOREIGN KEY ("picking_id") REFERENCES "picking"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "picking_linea_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "picking_linea_picking_id_product_id_key" ON "picking_linea"("picking_id", "product_id");

CREATE TABLE IF NOT EXISTS "cliente_plu" (
    "cliente_id" UUID NOT NULL,
    "plu" TEXT NOT NULL,
    "product_id" UUID NOT NULL,
    "descripcion" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "cliente_plu_pkey" PRIMARY KEY ("cliente_id","plu"),
    CONSTRAINT "cliente_plu_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "cliente_plu_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE
);