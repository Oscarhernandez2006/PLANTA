-- Preparar orden: distribución de canales de la orden de producción por tienda.
CREATE TABLE "production_order_tienda" (
    "id" UUID NOT NULL,
    "production_order_id" UUID NOT NULL,
    "tienda_id" UUID NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "production_order_tienda_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "production_order_tienda_cantidad_check" CHECK ("cantidad" > 0)
);

CREATE UNIQUE INDEX "production_order_tienda_production_order_id_tienda_id_key" ON "production_order_tienda"("production_order_id", "tienda_id");

ALTER TABLE "production_order_tienda" ADD CONSTRAINT "production_order_tienda_production_order_id_fkey" FOREIGN KEY ("production_order_id") REFERENCES "production_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "production_order_tienda" ADD CONSTRAINT "production_order_tienda_tienda_id_fkey" FOREIGN KEY ("tienda_id") REFERENCES "cliente_tienda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "production_order_tienda" ADD CONSTRAINT "production_order_tienda_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
