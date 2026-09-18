-- Mueve la clasificación de bodega/cava/destino/observaciones de "por animal"
-- (orden_beneficio_evento) a "por pieza" (canal_pieza): CIZQ y CDER de una
-- misma media canal ahora pueden ir a bodegas/cavas distintas.

ALTER TABLE "canal_pieza"
  ADD COLUMN "bodega" TEXT,
  ADD COLUMN "cava" TEXT,
  ADD COLUMN "destino" TEXT,
  ADD COLUMN "observaciones" TEXT;

-- Backfill: copia lo que ya estaba guardado por animal a cada una de sus piezas.
UPDATE "canal_pieza" cp
SET "bodega" = obe."bodega",
    "cava" = obe."cava",
    "destino" = obe."destino",
    "observaciones" = obe."observaciones"
FROM "orden_beneficio_evento" obe
WHERE cp."orden_beneficio_evento_id" = obe."id";

ALTER TABLE "orden_beneficio_evento"
  DROP COLUMN "bodega",
  DROP COLUMN "cava",
  DROP COLUMN "destino",
  DROP COLUMN "observaciones";

-- canal_traslado pasa de referenciar el animal (evento) a referenciar la
-- pieza específica que se movió de cava.
ALTER TABLE "canal_traslado" ADD COLUMN "canal_pieza_id" UUID;

-- Backfill best-effort: si el animal tenía una sola pieza pesada, se asocia
-- directamente; si tenía más de una (media canal), se asocia a la primera
-- (dato histórico ambiguo, no hay forma de saber cuál se trasladó realmente).
UPDATE "canal_traslado" ct
SET "canal_pieza_id" = sub.pieza_id
FROM (
  SELECT DISTINCT ON (cp."orden_beneficio_evento_id")
    cp."orden_beneficio_evento_id" AS evento_id,
    cp."id" AS pieza_id
  FROM "canal_pieza" cp
  ORDER BY cp."orden_beneficio_evento_id", cp."weighed_at" ASC
) sub
WHERE ct."orden_beneficio_evento_id" = sub.evento_id;

-- Traslados que no tenían ninguna pieza pesada asociada (no debería pasar en
-- datos reales, pero por seguridad) se eliminan para poder dejar la columna
-- NOT NULL.
DELETE FROM "canal_traslado" WHERE "canal_pieza_id" IS NULL;

ALTER TABLE "canal_traslado" ALTER COLUMN "canal_pieza_id" SET NOT NULL;

DROP INDEX "canal_traslado_orden_beneficio_evento_id_idx";
ALTER TABLE "canal_traslado" DROP CONSTRAINT "canal_traslado_orden_beneficio_evento_id_fkey";
ALTER TABLE "canal_traslado" DROP COLUMN "orden_beneficio_evento_id";

CREATE INDEX "canal_traslado_canal_pieza_id_idx" ON "canal_traslado"("canal_pieza_id");

ALTER TABLE "canal_traslado" ADD CONSTRAINT "canal_traslado_canal_pieza_id_fkey"
  FOREIGN KEY ("canal_pieza_id") REFERENCES "canal_pieza"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
