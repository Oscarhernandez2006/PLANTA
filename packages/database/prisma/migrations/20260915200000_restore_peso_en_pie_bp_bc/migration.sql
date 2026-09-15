-- Repara desfase: las columnas bp_reference/bc_reference de peso_en_pie
-- desaparecieron de la base real (posible ALTER manual fuera de Prisma),
-- aunque el historial de migraciones las marcaba como aplicadas.
-- Este script las restaura y rellena los datos existentes sin perderlos.
ALTER TABLE "peso_en_pie" ADD COLUMN IF NOT EXISTS "bp_reference" INTEGER;
ALTER TABLE "peso_en_pie" ADD COLUMN IF NOT EXISTS "bc_reference" INTEGER;

-- Asigna un bp_reference por cada guía existente (orden de aparición) donde falte.
WITH guides AS (
  SELECT plant_id, guia,
         DENSE_RANK() OVER (PARTITION BY plant_id ORDER BY MIN(created_at)) AS bp
  FROM "peso_en_pie"
  WHERE bp_reference IS NULL
  GROUP BY plant_id, guia
)
UPDATE "peso_en_pie" p
SET bp_reference = g.bp
FROM guides g
WHERE p.plant_id = g.plant_id
  AND p.guia IS NOT DISTINCT FROM g.guia
  AND p.bp_reference IS NULL;

-- Enlaza bc_reference con la guía de peso_camion correspondiente, si existe.
UPDATE "peso_en_pie" p
SET bc_reference = pc.reference
FROM "peso_camion" pc
WHERE p.bc_reference IS NULL
  AND p.guia IS NOT NULL
  AND pc.plant_id = p.plant_id
  AND pc.guia = p.guia;

ALTER TABLE "peso_en_pie" ALTER COLUMN "bp_reference" SET NOT NULL;

DROP INDEX IF EXISTS "peso_en_pie_plant_id_date_reference_key";
DROP INDEX IF EXISTS "peso_en_pie_plant_id_bp_reference_reference_key";
CREATE UNIQUE INDEX IF NOT EXISTS "peso_en_pie_plant_id_bp_reference_reference_key" ON "peso_en_pie"("plant_id", "bp_reference", "reference");
CREATE INDEX IF NOT EXISTS "peso_en_pie_plant_id_bp_reference_idx" ON "peso_en_pie"("plant_id", "bp_reference");
