-- Remisión de Traslado Bodega a Bodega (TBB): mueve productos disponibles de un cliente
-- de una bodega a otra del mismo cliente, con trazabilidad del movimiento.

-- CreateTable
CREATE TABLE "bodega_transfer" (
    "id" UUID NOT NULL,
    "plant_id" UUID NOT NULL,
    "tbb_number" INTEGER NOT NULL,
    "cliente_id" UUID NOT NULL,
    "origen_bodega_id" UUID NOT NULL,
    "destino_bodega_id" UUID NOT NULL,
    "observaciones" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bodega_transfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bodega_transfer_item" (
    "id" UUID NOT NULL,
    "bodega_transfer_id" UUID NOT NULL,
    "etiqueta_id" UUID,
    "acond_etiqueta_id" UUID,
    "codigo" TEXT,
    "product_codigo" TEXT NOT NULL,
    "product_nombre" TEXT NOT NULL,
    "tienda_codigo" TEXT,
    "tienda" TEXT,
    "pieza" INTEGER NOT NULL,
    "neto_kg" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bodega_transfer_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bodega_transfer_plant_id_cliente_id_idx" ON "bodega_transfer"("plant_id", "cliente_id");

-- CreateIndex
CREATE UNIQUE INDEX "bodega_transfer_plant_id_tbb_number_key" ON "bodega_transfer"("plant_id", "tbb_number");

-- CreateIndex
CREATE INDEX "bodega_transfer_item_bodega_transfer_id_idx" ON "bodega_transfer_item"("bodega_transfer_id");

-- CreateIndex
CREATE INDEX "bodega_transfer_item_etiqueta_id_idx" ON "bodega_transfer_item"("etiqueta_id");

-- CreateIndex
CREATE INDEX "bodega_transfer_item_acond_etiqueta_id_idx" ON "bodega_transfer_item"("acond_etiqueta_id");

-- AddForeignKey
ALTER TABLE "bodega_transfer" ADD CONSTRAINT "bodega_transfer_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bodega_transfer" ADD CONSTRAINT "bodega_transfer_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bodega_transfer" ADD CONSTRAINT "bodega_transfer_origen_bodega_id_fkey" FOREIGN KEY ("origen_bodega_id") REFERENCES "bodega"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bodega_transfer" ADD CONSTRAINT "bodega_transfer_destino_bodega_id_fkey" FOREIGN KEY ("destino_bodega_id") REFERENCES "bodega"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bodega_transfer" ADD CONSTRAINT "bodega_transfer_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bodega_transfer_item" ADD CONSTRAINT "bodega_transfer_item_bodega_transfer_id_fkey" FOREIGN KEY ("bodega_transfer_id") REFERENCES "bodega_transfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bodega_transfer_item" ADD CONSTRAINT "bodega_transfer_item_etiqueta_id_fkey" FOREIGN KEY ("etiqueta_id") REFERENCES "rotulado_etiqueta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bodega_transfer_item" ADD CONSTRAINT "bodega_transfer_item_acond_etiqueta_id_fkey" FOREIGN KEY ("acond_etiqueta_id") REFERENCES "acondicionamiento_etiqueta"("id") ON DELETE SET NULL ON UPDATE CASCADE;
