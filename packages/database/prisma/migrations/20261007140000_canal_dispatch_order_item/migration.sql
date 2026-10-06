-- Canales despachadas (caliente o frío) en una orden DC.
CREATE TABLE "canal_dispatch_order_item" (
    "id" UUID NOT NULL,
    "canal_dispatch_order_id" UUID NOT NULL,
    "canal_pieza_id" UUID NOT NULL,
    "cava_origen" TEXT NOT NULL,
    "peso_caliente_kg" DECIMAL(12,2) NOT NULL,
    "despacho_kg" DECIMAL(12,2),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "canal_dispatch_order_item_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "canal_dispatch_order_item_canal_pieza_id_key" ON "canal_dispatch_order_item"("canal_pieza_id");
CREATE INDEX "canal_dispatch_order_item_canal_dispatch_order_id_idx" ON "canal_dispatch_order_item"("canal_dispatch_order_id");

ALTER TABLE "canal_dispatch_order_item" ADD CONSTRAINT "canal_dispatch_order_item_canal_dispatch_order_id_fkey"
    FOREIGN KEY ("canal_dispatch_order_id") REFERENCES "canal_dispatch_order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "canal_dispatch_order_item" ADD CONSTRAINT "canal_dispatch_order_item_canal_pieza_id_fkey"
    FOREIGN KEY ("canal_pieza_id") REFERENCES "canal_pieza"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "canal_dispatch_order_item" ADD CONSTRAINT "canal_dispatch_order_item_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
