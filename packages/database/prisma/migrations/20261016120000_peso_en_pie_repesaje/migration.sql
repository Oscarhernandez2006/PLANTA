-- Repesaje de guías cerradas en Peso en Pie: estado de la ronda por guía e
-- historial por animal (peso anterior, nuevo y merma).
ALTER TABLE "peso_camion" ADD COLUMN "repesaje_ronda" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "peso_camion" ADD COLUMN "repesaje_abierto" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "peso_en_pie_repesaje" (
    "id" UUID NOT NULL,
    "plant_id" UUID NOT NULL,
    "peso_en_pie_id" UUID NOT NULL,
    "ronda" INTEGER NOT NULL,
    "peso_anterior_kg" DECIMAL(12,2) NOT NULL,
    "peso_nuevo_kg" DECIMAL(12,2) NOT NULL,
    "merma_kg" DECIMAL(12,2) NOT NULL,
    "operator_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "peso_en_pie_repesaje_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "peso_en_pie_repesaje_peso_en_pie_id_ronda_key" ON "peso_en_pie_repesaje"("peso_en_pie_id", "ronda");
CREATE INDEX "peso_en_pie_repesaje_plant_id_created_at_idx" ON "peso_en_pie_repesaje"("plant_id", "created_at");

ALTER TABLE "peso_en_pie_repesaje" ADD CONSTRAINT "peso_en_pie_repesaje_peso_en_pie_id_fkey"
    FOREIGN KEY ("peso_en_pie_id") REFERENCES "peso_en_pie"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
