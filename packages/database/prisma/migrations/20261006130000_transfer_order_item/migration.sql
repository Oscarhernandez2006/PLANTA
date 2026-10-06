-- Productos (etiquetas de pieza o canastillas) trasladados a proceso en una Orden de Traslado.
CREATE TABLE "transfer_order_item" (
    "id" UUID NOT NULL,
    "transfer_order_id" UUID NOT NULL,
    "etiqueta_id" UUID,
    "canastilla_id" UUID,
    "codigo" TEXT NOT NULL,
    "product_id" UUID NOT NULL,
    "unds" INTEGER NOT NULL,
    "peso_kg" DECIMAL(12,2) NOT NULL,
    "tara_kg" DECIMAL(12,2) NOT NULL,
    "neto_kg" DECIMAL(12,2) NOT NULL,
    "neto_etiqueta_kg" DECIMAL(12,2) NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transfer_order_item_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "transfer_order_item_etiqueta_id_key" ON "transfer_order_item"("etiqueta_id");
CREATE UNIQUE INDEX "transfer_order_item_canastilla_id_key" ON "transfer_order_item"("canastilla_id");
CREATE INDEX "transfer_order_item_transfer_order_id_idx" ON "transfer_order_item"("transfer_order_id");

ALTER TABLE "transfer_order_item" ADD CONSTRAINT "transfer_order_item_transfer_order_id_fkey"
    FOREIGN KEY ("transfer_order_id") REFERENCES "transfer_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transfer_order_item" ADD CONSTRAINT "transfer_order_item_etiqueta_id_fkey"
    FOREIGN KEY ("etiqueta_id") REFERENCES "rotulado_etiqueta"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "transfer_order_item" ADD CONSTRAINT "transfer_order_item_canastilla_id_fkey"
    FOREIGN KEY ("canastilla_id") REFERENCES "rotulado_canastilla"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "transfer_order_item" ADD CONSTRAINT "transfer_order_item_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transfer_order_item" ADD CONSTRAINT "transfer_order_item_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
