-- Consecutivo de piezas de Rotulado Desposte por estación.
-- CreateTable
CREATE TABLE "rotulado_consecutivo_estacion" (
    "plant_id" UUID NOT NULL,
    "production_order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "estacion" INTEGER NOT NULL,
    "ultimo" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "rotulado_consecutivo_estacion_pkey" PRIMARY KEY ("plant_id","production_order_id","product_id","estacion")
);

-- AddForeignKey
ALTER TABLE "rotulado_consecutivo_estacion" ADD CONSTRAINT "rotulado_consecutivo_estacion_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rotulado_consecutivo_estacion" ADD CONSTRAINT "rotulado_consecutivo_estacion_production_order_id_fkey" FOREIGN KEY ("production_order_id") REFERENCES "production_order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rotulado_consecutivo_estacion" ADD CONSTRAINT "rotulado_consecutivo_estacion_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
