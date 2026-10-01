-- Peso en Pie tiene su propio estado de guía, independiente de Peso en Camión.
ALTER TABLE "peso_camion" ADD COLUMN "pie_status" "PesoCamionStatus" NOT NULL DEFAULT 'abierta';
UPDATE "peso_camion" SET "pie_status" = "status";
CREATE INDEX "peso_camion_plant_id_pie_status_idx" ON "peso_camion"("plant_id", "pie_status");
