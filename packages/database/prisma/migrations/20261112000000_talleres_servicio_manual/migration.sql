-- CreateTable
CREATE TABLE "servicio_manual" (
    "id" UUID NOT NULL,
    "plant_id" UUID NOT NULL,
    "production_order_id" UUID,
    "transfer_order_id" UUID,
    "concepto" TEXT NOT NULL,
    "cantidad" DECIMAL(12,2) NOT NULL,
    "valor_unitario" DECIMAL(14,2),
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "servicio_manual_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "servicio_manual_production_order_id_idx" ON "servicio_manual"("production_order_id");

-- CreateIndex
CREATE INDEX "servicio_manual_transfer_order_id_idx" ON "servicio_manual"("transfer_order_id");

-- AddForeignKey
ALTER TABLE "servicio_manual" ADD CONSTRAINT "servicio_manual_production_order_id_fkey" FOREIGN KEY ("production_order_id") REFERENCES "production_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servicio_manual" ADD CONSTRAINT "servicio_manual_transfer_order_id_fkey" FOREIGN KEY ("transfer_order_id") REFERENCES "transfer_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
