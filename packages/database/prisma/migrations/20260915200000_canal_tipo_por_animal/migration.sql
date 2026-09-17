-- Mueve el tipo de canal de la orden (una vez por orden) al animal (evento):
-- cada animal debe poder tener su propio tipo (completa / media canal).
ALTER TABLE "orden_beneficio_evento" ADD COLUMN "canal_tipo" "CanalTipo";

UPDATE "orden_beneficio_evento" e
SET "canal_tipo" = o."canal_tipo"
FROM "orden_beneficio" o
WHERE e."orden_beneficio_id" = o.id AND o."canal_tipo" IS NOT NULL;

ALTER TABLE "orden_beneficio" DROP COLUMN "canal_tipo";
