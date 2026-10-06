-- Orden de Acondicionamiento (O.C.): consecutivo propio por planta, ligada a una orden de traslado.
CREATE TABLE "conditioning_order" (
    "id" UUID NOT NULL,
    "plant_id" UUID NOT NULL,
    "oc_number" INTEGER NOT NULL,
    "registration_date" DATE NOT NULL,
    "process_date" DATE NOT NULL,
    "cliente_id" UUID NOT NULL,
    "transfer_order_id" UUID NOT NULL,
    "status" "DispatchOrderStatus" NOT NULL DEFAULT 'activo',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "conditioning_order_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "conditioning_order_plant_id_oc_number_key" ON "conditioning_order"("plant_id", "oc_number");
CREATE INDEX "conditioning_order_plant_id_status_idx" ON "conditioning_order"("plant_id", "status");
CREATE INDEX "conditioning_order_transfer_order_id_idx" ON "conditioning_order"("transfer_order_id");

ALTER TABLE "conditioning_order" ADD CONSTRAINT "conditioning_order_plant_id_fkey"
    FOREIGN KEY ("plant_id") REFERENCES "plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "conditioning_order" ADD CONSTRAINT "conditioning_order_cliente_id_fkey"
    FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "conditioning_order" ADD CONSTRAINT "conditioning_order_transfer_order_id_fkey"
    FOREIGN KEY ("transfer_order_id") REFERENCES "transfer_order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "conditioning_order" ADD CONSTRAINT "conditioning_order_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
