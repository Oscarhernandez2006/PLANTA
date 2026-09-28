CREATE TABLE "rotulado_consecutivo" (
    "plant_id" UUID NOT NULL,
    "production_order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "ultimo" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "rotulado_consecutivo_pkey" PRIMARY KEY ("plant_id","production_order_id","product_id")
);

ALTER TABLE "rotulado_consecutivo" ADD CONSTRAINT "rotulado_consecutivo_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rotulado_consecutivo" ADD CONSTRAINT "rotulado_consecutivo_production_order_id_fkey" FOREIGN KEY ("production_order_id") REFERENCES "production_order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rotulado_consecutivo" ADD CONSTRAINT "rotulado_consecutivo_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;