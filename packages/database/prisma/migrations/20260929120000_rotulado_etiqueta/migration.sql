-- Etiquetas de producto impresas en Rotulado Desposte (ligadas a la orden de producción).
CREATE TABLE "rotulado_etiqueta" (
    "id" UUID NOT NULL,
    "plant_id" UUID NOT NULL,
    "production_order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "tienda_id" UUID NOT NULL,
    "bodega_id" UUID,
    "pieza" INTEGER NOT NULL,
    "tara_kg" DECIMAL(12,2) NOT NULL,
    "bruto_kg" DECIMAL(12,2) NOT NULL,
    "neto_kg" DECIMAL(12,2) NOT NULL,
    "empaque" TEXT NOT NULL,
    "conservacion" TEXT NOT NULL,
    "temperatura" TEXT NOT NULL,
    "fecha_sacrificio" DATE NOT NULL,
    "fecha_empaque" DATE NOT NULL,
    "fecha_vencimiento" DATE,
    "ref" TEXT,
    "procesado_para" TEXT,
    "impresa" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "deleted_by" UUID,

    CONSTRAINT "rotulado_etiqueta_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rotulado_etiqueta_neto_check" CHECK ("neto_kg" > 0)
);

CREATE UNIQUE INDEX "rotulado_etiqueta_production_order_id_product_id_pieza_key" ON "rotulado_etiqueta"("production_order_id", "product_id", "pieza");
CREATE INDEX "rotulado_etiqueta_production_order_id_product_id_tienda_id_idx" ON "rotulado_etiqueta"("production_order_id", "product_id", "tienda_id");

ALTER TABLE "rotulado_etiqueta" ADD CONSTRAINT "rotulado_etiqueta_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rotulado_etiqueta" ADD CONSTRAINT "rotulado_etiqueta_production_order_id_fkey" FOREIGN KEY ("production_order_id") REFERENCES "production_order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rotulado_etiqueta" ADD CONSTRAINT "rotulado_etiqueta_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rotulado_etiqueta" ADD CONSTRAINT "rotulado_etiqueta_tienda_id_fkey" FOREIGN KEY ("tienda_id") REFERENCES "cliente_tienda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rotulado_etiqueta" ADD CONSTRAINT "rotulado_etiqueta_bodega_id_fkey" FOREIGN KEY ("bodega_id") REFERENCES "bodega"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "rotulado_etiqueta" ADD CONSTRAINT "rotulado_etiqueta_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rotulado_etiqueta" ADD CONSTRAINT "rotulado_etiqueta_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
