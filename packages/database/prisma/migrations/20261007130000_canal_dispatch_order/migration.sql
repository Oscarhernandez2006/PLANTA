-- Orden de Despacho de Canales (DC): despacho en caliente o en frío, un solo consecutivo.
CREATE TYPE "CanalDispatchType" AS ENUM ('caliente', 'frio');

CREATE TABLE "canal_dispatch_order" (
    "id" UUID NOT NULL,
    "plant_id" UUID NOT NULL,
    "dc_number" INTEGER NOT NULL,
    "tipo" "CanalDispatchType" NOT NULL,
    "registration_date" DATE NOT NULL,
    "process_date" DATE NOT NULL,
    "cliente_id" UUID NOT NULL,
    "status" "DispatchOrderStatus" NOT NULL DEFAULT 'activo',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "canal_dispatch_order_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "canal_dispatch_order_plant_id_dc_number_key" ON "canal_dispatch_order"("plant_id", "dc_number");
CREATE INDEX "canal_dispatch_order_plant_id_tipo_status_idx" ON "canal_dispatch_order"("plant_id", "tipo", "status");

ALTER TABLE "canal_dispatch_order" ADD CONSTRAINT "canal_dispatch_order_plant_id_fkey"
    FOREIGN KEY ("plant_id") REFERENCES "plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "canal_dispatch_order" ADD CONSTRAINT "canal_dispatch_order_cliente_id_fkey"
    FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "canal_dispatch_order" ADD CONSTRAINT "canal_dispatch_order_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
