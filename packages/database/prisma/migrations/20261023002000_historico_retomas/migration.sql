-- Histórico Sacrificio: hoja RETOMAS y tarifas de subproductos del Excel.
-- CreateTable
CREATE TABLE "historico_retoma" (
    "id" UUID NOT NULL,
    "plant_id" UUID NOT NULL,
    "fecha" DATE NOT NULL,
    "firmador" TEXT,
    "reses" INTEGER NOT NULL DEFAULT 0,
    "cabezas" INTEGER,
    "despojos" INTEGER,
    "libros" INTEGER,
    "pieles_kg" DECIMAL(12,2),
    "visceras_rojas" INTEGER,
    "sebo_kg" DECIMAL(12,2),
    "valor_cabezas" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "valor_despojos" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "valor_libros" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "valor_pieles" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "valor_visceras_rojas" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "valor_sebo" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "historico_retoma_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historico_tarifa_subproducto" (
    "id" UUID NOT NULL,
    "plant_id" UUID NOT NULL,
    "cliente" TEXT NOT NULL,
    "cabezas" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "despojos" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "libros" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "pieles" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sebo" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "visceras_rojas" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "historico_tarifa_subproducto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "historico_retoma_plant_id_fecha_idx" ON "historico_retoma"("plant_id", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "historico_tarifa_subproducto_plant_id_cliente_key" ON "historico_tarifa_subproducto"("plant_id", "cliente");

