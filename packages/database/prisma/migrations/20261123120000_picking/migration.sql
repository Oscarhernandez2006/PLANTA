-- Picking (pre-orden) desde la terminal móvil para despachos posta y traslados.
-- Las etiquetas alistadas se registran en la orden al pesar el arrume en el escritorio.
DO $$ BEGIN
  CREATE TYPE "PickingStatus" AS ENUM ('en_curso', 'terminado');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "picking" (
    "id" UUID NOT NULL,
    "plant_id" UUID NOT NULL,
    "canal_dispatch_order_id" UUID,
    "transfer_order_id" UUID,
    "status" "PickingStatus" NOT NULL DEFAULT 'en_curso',
    "terminado_at" TIMESTAMPTZ(6),
    "terminado_by" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "picking_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "picking_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "picking_canal_dispatch_order_id_fkey" FOREIGN KEY ("canal_dispatch_order_id") REFERENCES "canal_dispatch_order"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "picking_transfer_order_id_fkey" FOREIGN KEY ("transfer_order_id") REFERENCES "transfer_order"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "picking_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "picking_canal_dispatch_order_id_key" ON "picking"("canal_dispatch_order_id");
CREATE UNIQUE INDEX IF NOT EXISTS "picking_transfer_order_id_key" ON "picking"("transfer_order_id");
CREATE INDEX IF NOT EXISTS "picking_plant_id_status_idx" ON "picking"("plant_id", "status");

CREATE TABLE IF NOT EXISTS "picking_item" (
    "id" UUID NOT NULL,
    "picking_id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "product_id" UUID NOT NULL,
    "unds" INTEGER NOT NULL,
    "neto_etiqueta_kg" DECIMAL(12,2) NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "picking_item_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "picking_item_picking_id_fkey" FOREIGN KEY ("picking_id") REFERENCES "picking"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "picking_item_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "picking_item_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "picking_item_codigo_idx" ON "picking_item"("codigo");
CREATE UNIQUE INDEX IF NOT EXISTS "picking_item_picking_id_codigo_key" ON "picking_item"("picking_id", "codigo");
