-- Orden de Producción (OP0000001) ligada a una orden de despacho.
CREATE TABLE "production_order" (
    "id" UUID NOT NULL,
    "plant_id" UUID NOT NULL,
    "op_number" INTEGER NOT NULL,
    "registration_date" DATE NOT NULL,
    "process_date" DATE NOT NULL,
    "cliente_id" UUID NOT NULL,
    "dispatch_order_id" UUID NOT NULL,
    "status" "DispatchOrderStatus" NOT NULL DEFAULT 'activo',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "production_order_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "production_order_plant_id_op_number_key" ON "production_order"("plant_id", "op_number");
CREATE INDEX "production_order_plant_id_status_idx" ON "production_order"("plant_id", "status");
CREATE INDEX "production_order_dispatch_order_id_idx" ON "production_order"("dispatch_order_id");

ALTER TABLE "production_order" ADD CONSTRAINT "production_order_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "production_order" ADD CONSTRAINT "production_order_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "production_order" ADD CONSTRAINT "production_order_dispatch_order_id_fkey" FOREIGN KEY ("dispatch_order_id") REFERENCES "dispatch_order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "production_order" ADD CONSTRAINT "production_order_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
