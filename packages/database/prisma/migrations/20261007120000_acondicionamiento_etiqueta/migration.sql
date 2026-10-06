-- Etiquetas de Rotulado Acondicionamiento: producto nuevo que sale de transformar lo trasladado en la OT de la OC.
CREATE TABLE "acondicionamiento_etiqueta" (
    "id" UUID NOT NULL,
    "plant_id" UUID NOT NULL,
    "conditioning_order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "tienda_id" UUID NOT NULL,
    "bodega_id" UUID,
    "pieza" INTEGER NOT NULL,
    "codigo" TEXT NOT NULL,
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
    "estacion" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "deleted_by" UUID,

    CONSTRAINT "acondicionamiento_etiqueta_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "acondicionamiento_etiqueta_codigo_key" ON "acondicionamiento_etiqueta"("codigo");
CREATE UNIQUE INDEX "acond_etiqueta_oc_producto_pieza_key" ON "acondicionamiento_etiqueta"("conditioning_order_id", "product_id", "pieza");
CREATE INDEX "acond_etiqueta_oc_producto_idx" ON "acondicionamiento_etiqueta"("conditioning_order_id", "product_id");
CREATE INDEX "acondicionamiento_etiqueta_bodega_id_idx" ON "acondicionamiento_etiqueta"("bodega_id");

ALTER TABLE "acondicionamiento_etiqueta" ADD CONSTRAINT "acondicionamiento_etiqueta_plant_id_fkey"
    FOREIGN KEY ("plant_id") REFERENCES "plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "acondicionamiento_etiqueta" ADD CONSTRAINT "acondicionamiento_etiqueta_conditioning_order_id_fkey"
    FOREIGN KEY ("conditioning_order_id") REFERENCES "conditioning_order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "acondicionamiento_etiqueta" ADD CONSTRAINT "acondicionamiento_etiqueta_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "acondicionamiento_etiqueta" ADD CONSTRAINT "acondicionamiento_etiqueta_tienda_id_fkey"
    FOREIGN KEY ("tienda_id") REFERENCES "cliente_tienda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "acondicionamiento_etiqueta" ADD CONSTRAINT "acondicionamiento_etiqueta_bodega_id_fkey"
    FOREIGN KEY ("bodega_id") REFERENCES "bodega"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "acondicionamiento_etiqueta" ADD CONSTRAINT "acondicionamiento_etiqueta_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "acondicionamiento_etiqueta" ADD CONSTRAINT "acondicionamiento_etiqueta_deleted_by_fkey"
    FOREIGN KEY ("deleted_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
