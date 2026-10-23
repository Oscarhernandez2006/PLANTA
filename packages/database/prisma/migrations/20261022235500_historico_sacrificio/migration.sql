-- Histórico Sacrificio: hoja BENEFICIO y tabla de TARIFAS del Excel.
-- CreateTable
CREATE TABLE "historico_beneficio" (
    "id" UUID NOT NULL,
    "plant_id" UUID NOT NULL,
    "fecha" DATE NOT NULL,
    "proveedor" TEXT,
    "firmador" TEXT,
    "cliente" TEXT,
    "granja" TEXT,
    "municipio" TEXT,
    "guia_ica" TEXT,
    "lote" INTEGER,
    "novillo" INTEGER NOT NULL DEFAULT 0,
    "novilla" INTEGER NOT NULL DEFAULT 0,
    "vaca" INTEGER NOT NULL DEFAULT 0,
    "toro" INTEGER NOT NULL DEFAULT 0,
    "bufalo" INTEGER NOT NULL DEFAULT 0,
    "pieles" INTEGER,
    "peso_pie_kg" DECIMAL(12,2),
    "peso_caliente_kg" DECIMAL(12,2),
    "tarifa" DECIMAL(14,2),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "historico_beneficio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historico_tarifa" (
    "id" UUID NOT NULL,
    "plant_id" UUID NOT NULL,
    "cliente" TEXT NOT NULL,
    "valor_base" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "historico_tarifa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "historico_beneficio_plant_id_fecha_idx" ON "historico_beneficio"("plant_id", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "historico_tarifa_plant_id_cliente_key" ON "historico_tarifa"("plant_id", "cliente");

