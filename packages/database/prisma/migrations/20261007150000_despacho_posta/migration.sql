-- Despacho Posta: tercer tipo de orden DC y productos rotulados despachados.
ALTER TYPE "CanalDispatchType" ADD VALUE IF NOT EXISTS 'posta';

CREATE TABLE "dispatch_product_item" (
    "id" UUID NOT NULL,
    "canal_dispatch_order_id" UUID NOT NULL,
    "etiqueta_id" UUID,
    "canastilla_id" UUID,
    "acond_etiqueta_id" UUID,
    "codigo" TEXT NOT NULL,
    "product_id" UUID NOT NULL,
    "unds" INTEGER NOT NULL,
    "peso_kg" DECIMAL(12,2) NOT NULL,
    "tara_kg" DECIMAL(12,2) NOT NULL,
    "neto_kg" DECIMAL(12,2) NOT NULL,
    "neto_etiqueta_kg" DECIMAL(12,2) NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispatch_product_item_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dispatch_product_item_etiqueta_id_key" ON "dispatch_product_item"("etiqueta_id");
CREATE UNIQUE INDEX "dispatch_product_item_canastilla_id_key" ON "dispatch_product_item"("canastilla_id");
CREATE UNIQUE INDEX "dispatch_product_item_acond_etiqueta_id_key" ON "dispatch_product_item"("acond_etiqueta_id");
CREATE INDEX "dispatch_product_item_canal_dispatch_order_id_idx" ON "dispatch_product_item"("canal_dispatch_order_id");

ALTER TABLE "dispatch_product_item" ADD CONSTRAINT "dispatch_product_item_canal_dispatch_order_id_fkey"
    FOREIGN KEY ("canal_dispatch_order_id") REFERENCES "canal_dispatch_order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "dispatch_product_item" ADD CONSTRAINT "dispatch_product_item_etiqueta_id_fkey"
    FOREIGN KEY ("etiqueta_id") REFERENCES "rotulado_etiqueta"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "dispatch_product_item" ADD CONSTRAINT "dispatch_product_item_canastilla_id_fkey"
    FOREIGN KEY ("canastilla_id") REFERENCES "rotulado_canastilla"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "dispatch_product_item" ADD CONSTRAINT "dispatch_product_item_acond_etiqueta_id_fkey"
    FOREIGN KEY ("acond_etiqueta_id") REFERENCES "acondicionamiento_etiqueta"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "dispatch_product_item" ADD CONSTRAINT "dispatch_product_item_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "dispatch_product_item" ADD CONSTRAINT "dispatch_product_item_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
