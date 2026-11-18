-- El consecutivo de OB es único por planta (no se reinicia por día).
DROP INDEX IF EXISTS "orden_beneficio_plant_id_date_reference_key";

WITH n AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY plant_id ORDER BY date, reference, created_at) AS rn
  FROM "orden_beneficio"
)
UPDATE "orden_beneficio" o SET reference = n.rn FROM n WHERE o.id = n.id AND o.reference <> n.rn;

CREATE UNIQUE INDEX "orden_beneficio_plant_id_reference_key" ON "orden_beneficio"("plant_id", "reference");
