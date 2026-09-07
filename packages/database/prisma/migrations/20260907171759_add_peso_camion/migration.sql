-- CreateEnum
CREATE TYPE "PesoCamionStatus" AS ENUM ('abierta', 'cerrada');

-- CreateTable
CREATE TABLE "peso_camion" (
    "id" UUID NOT NULL,
    "plant_id" UUID NOT NULL,
    "reference" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "guia" TEXT,
    "procedencia" TEXT,
    "proveedor" TEXT,
    "cliente" TEXT,
    "placa" TEXT,
    "conductor" TEXT,
    "observaciones" TEXT,
    "cantidad" INTEGER,
    "entrada" DECIMAL(12,2),
    "salida" DECIMAL(12,2),
    "status" "PesoCamionStatus" NOT NULL DEFAULT 'abierta',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "peso_camion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "peso_camion_plant_id_status_idx" ON "peso_camion"("plant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "peso_camion_plant_id_date_reference_key" ON "peso_camion"("plant_id", "date", "reference");
