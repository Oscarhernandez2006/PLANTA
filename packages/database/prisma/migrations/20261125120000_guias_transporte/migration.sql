-- Puntos de envío (clientes del cliente) y guías de transporte (GM1, GM2…) que se amarran
-- a las órdenes de despacho de canales al cerrarlas.
CREATE TABLE IF NOT EXISTS "punto_envio" (
    "id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "razon_social" TEXT NOT NULL,
    "nit" TEXT,
    "telefono" TEXT,
    "direccion" TEXT,
    "municipio" TEXT,
    "departamento" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "punto_envio_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "punto_envio_cliente_id_razon_social_key" ON "punto_envio"("cliente_id", "razon_social");

CREATE TABLE IF NOT EXISTS "guia_transporte" (
    "id" UUID NOT NULL,
    "plant_id" UUID NOT NULL,
    "numero" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "tipo_vehiculo" TEXT NOT NULL,
    "placa" TEXT NOT NULL,
    "conductor" TEXT NOT NULL,
    "cedula" TEXT,
    "observacion" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    CONSTRAINT "guia_transporte_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "guia_transporte_plant_id_numero_key" ON "guia_transporte"("plant_id", "numero");
CREATE INDEX IF NOT EXISTS "guia_transporte_plant_id_fecha_idx" ON "guia_transporte"("plant_id", "fecha");

ALTER TABLE "canal_dispatch_order"
  ADD COLUMN IF NOT EXISTS "punto_envio_id" UUID,
  ADD COLUMN IF NOT EXISTS "guia_transporte_id" UUID,
  ADD COLUMN IF NOT EXISTS "cerrada_at" TIMESTAMPTZ(6);
CREATE INDEX IF NOT EXISTS "canal_dispatch_order_guia_transporte_id_idx" ON "canal_dispatch_order"("guia_transporte_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'punto_envio_cliente_id_fkey') THEN
    ALTER TABLE "punto_envio" ADD CONSTRAINT "punto_envio_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'guia_transporte_plant_id_fkey') THEN
    ALTER TABLE "guia_transporte" ADD CONSTRAINT "guia_transporte_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'guia_transporte_created_by_fkey') THEN
    ALTER TABLE "guia_transporte" ADD CONSTRAINT "guia_transporte_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'canal_dispatch_order_punto_envio_id_fkey') THEN
    ALTER TABLE "canal_dispatch_order" ADD CONSTRAINT "canal_dispatch_order_punto_envio_id_fkey" FOREIGN KEY ("punto_envio_id") REFERENCES "punto_envio"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'canal_dispatch_order_guia_transporte_id_fkey') THEN
    ALTER TABLE "canal_dispatch_order" ADD CONSTRAINT "canal_dispatch_order_guia_transporte_id_fkey" FOREIGN KEY ("guia_transporte_id") REFERENCES "guia_transporte"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
