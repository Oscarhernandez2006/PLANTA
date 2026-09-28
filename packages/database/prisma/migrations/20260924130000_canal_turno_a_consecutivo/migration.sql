-- El turno deja de ser un enum manana/tarde elegido a mano: pasa a ser el
-- consecutivo del día del animal (mismo orden en que se tumba/pesa), así que
-- el campo se vuelve numérico y ya no se le pide al operario.
ALTER TABLE "canal_pieza" ADD COLUMN "turno_new" INTEGER;

UPDATE "canal_pieza" cp
SET "turno_new" = base.consecutivo
FROM (
  SELECT
    e.id AS evento_id,
    (
      SELECT COALESCE(SUM(ob2."animal_count"), 0)
      FROM "orden_beneficio" ob2
      WHERE ob2."plant_id" = ob."plant_id"
        AND ob2."deleted_at" IS NULL
        AND ob2."date" = ob."date"
        AND ob2."reference" < ob."reference"
    ) + e."sequence" AS consecutivo
  FROM "orden_beneficio_evento" e
  JOIN "orden_beneficio" ob ON ob."id" = e."orden_beneficio_id"
) base
WHERE cp."orden_beneficio_evento_id" = base.evento_id;

ALTER TABLE "canal_pieza" DROP COLUMN "turno";
ALTER TABLE "canal_pieza" RENAME COLUMN "turno_new" TO "turno";

DROP TYPE IF EXISTS "CanalTurno";
