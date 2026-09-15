-- BP (Báscula en Pie): consecutivo por guía + asociación con la BC (Báscula Camión).
ALTER TABLE "peso_en_pie" ADD COLUMN "bp_reference" INTEGER NOT NULL;
ALTER TABLE "peso_en_pie" ADD COLUMN "bc_reference" INTEGER;

DROP INDEX "peso_en_pie_plant_id_date_reference_key";
CREATE UNIQUE INDEX "peso_en_pie_plant_id_bp_reference_reference_key" ON "peso_en_pie"("plant_id", "bp_reference", "reference");
CREATE INDEX "peso_en_pie_plant_id_bp_reference_idx" ON "peso_en_pie"("plant_id", "bp_reference");
