-- Orden de Traslado (O.T.): consecutivo propio por planta.
CREATE TABLE "transfer_order" (
    "id" UUID NOT NULL,
    "plant_id" UUID NOT NULL,
    "ot_number" INTEGER NOT NULL,
    "registration_date" DATE NOT NULL,
    "process_date" DATE NOT NULL,
    "cliente_id" UUID NOT NULL,
    "status" "DispatchOrderStatus" NOT NULL DEFAULT 'activo',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "transfer_order_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "transfer_order_plant_id_ot_number_key" ON "transfer_order"("plant_id", "ot_number");
CREATE INDEX "transfer_order_plant_id_status_idx" ON "transfer_order"("plant_id", "status");

ALTER TABLE "transfer_order" ADD CONSTRAINT "transfer_order_plant_id_fkey"
    FOREIGN KEY ("plant_id") REFERENCES "plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transfer_order" ADD CONSTRAINT "transfer_order_cliente_id_fkey"
    FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transfer_order" ADD CONSTRAINT "transfer_order_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
