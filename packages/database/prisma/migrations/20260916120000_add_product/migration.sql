-- Catálogo simple de productos.
CREATE TABLE "product" (
    "id" UUID NOT NULL,
    "plant_id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_plant_id_codigo_key" ON "product"("plant_id", "codigo");

CREATE INDEX "product_plant_id_idx" ON "product"("plant_id");

ALTER TABLE "product" ADD CONSTRAINT "product_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed: producto de prueba para cada planta existente.
INSERT INTO "product" ("id", "plant_id", "codigo", "nombre")
SELECT gen_random_uuid(), "id", '0001', 'Producto de prueba'
FROM "plant";
