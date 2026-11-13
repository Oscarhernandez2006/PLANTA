-- CreateEnum
CREATE TYPE "TarifaBase" AS ENUM ('kg_frio', 'kg_entrada', 'kg', 'kg_empacado', 'unidad', 'canal');

-- CreateEnum
CREATE TYPE "CostoGanadoMetodo" AS ENUM ('kg_pie', 'kg_finca', 'kg_canal', 'por_animal', 'valor_total');

-- CreateTable
CREATE TABLE "precio_lista" (
    "id" UUID NOT NULL,
    "plant_id" UUID NOT NULL,
    "cliente_id" UUID,
    "nombre" TEXT NOT NULL,
    "vigente_desde" DATE NOT NULL,
    "observaciones" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "precio_lista_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "precio_lista_item" (
    "id" UUID NOT NULL,
    "lista_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "precio_kg" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "precio_lista_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tarifa_proceso" (
    "id" UUID NOT NULL,
    "plant_id" UUID NOT NULL,
    "cliente_id" UUID,
    "categoria" TEXT NOT NULL,
    "concepto" TEXT NOT NULL,
    "base" "TarifaBase" NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "vigente_desde" DATE NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tarifa_proceso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regla_corte" (
    "id" UUID NOT NULL,
    "plant_id" UUID NOT NULL,
    "cliente_id" UUID,
    "product_id" UUID NOT NULL,
    "retoma" BOOLEAN NOT NULL DEFAULT false,
    "piking" BOOLEAN NOT NULL DEFAULT false,
    "congelacion" BOOLEAN NOT NULL DEFAULT false,
    "kg_congelados" DECIMAL(12,2),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "regla_corte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "costo_ganado" (
    "id" UUID NOT NULL,
    "plant_id" UUID NOT NULL,
    "orden_beneficio_id" UUID NOT NULL,
    "metodo" "CostoGanadoMetodo" NOT NULL,
    "valor_unitario" DECIMAL(16,2) NOT NULL,
    "peso_finca_kg" DECIMAL(12,2),
    "proveedor" TEXT,
    "referencia" TEXT,
    "observaciones" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "costo_ganado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "precio_lista_plant_id_vigente_desde_idx" ON "precio_lista"("plant_id", "vigente_desde");

-- CreateIndex
CREATE UNIQUE INDEX "precio_lista_item_lista_id_product_id_key" ON "precio_lista_item"("lista_id", "product_id");

-- CreateIndex
CREATE INDEX "tarifa_proceso_plant_id_concepto_vigente_desde_idx" ON "tarifa_proceso"("plant_id", "concepto", "vigente_desde");

-- CreateIndex
CREATE INDEX "regla_corte_plant_id_product_id_idx" ON "regla_corte"("plant_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "costo_ganado_orden_beneficio_id_key" ON "costo_ganado"("orden_beneficio_id");

-- CreateIndex
CREATE INDEX "costo_ganado_plant_id_idx" ON "costo_ganado"("plant_id");

-- AddForeignKey
ALTER TABLE "precio_lista" ADD CONSTRAINT "precio_lista_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "precio_lista_item" ADD CONSTRAINT "precio_lista_item_lista_id_fkey" FOREIGN KEY ("lista_id") REFERENCES "precio_lista"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "precio_lista_item" ADD CONSTRAINT "precio_lista_item_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarifa_proceso" ADD CONSTRAINT "tarifa_proceso_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regla_corte" ADD CONSTRAINT "regla_corte_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regla_corte" ADD CONSTRAINT "regla_corte_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costo_ganado" ADD CONSTRAINT "costo_ganado_orden_beneficio_id_fkey" FOREIGN KEY ("orden_beneficio_id") REFERENCES "orden_beneficio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
