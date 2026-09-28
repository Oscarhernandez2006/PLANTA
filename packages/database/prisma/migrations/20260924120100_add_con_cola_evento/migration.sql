-- Con/sin cola pasa a ser una clasificación independiente de cuál pieza
-- (CIZQ/CDER) se pesó primero: se agrega la columna con_cola y se migran
-- los animales existentes que ya tenían tipo con_cola/sin_cola al tipo
-- genérico media_canal + con_cola true/false.
ALTER TABLE "orden_beneficio_evento" ADD COLUMN "con_cola" BOOLEAN;

UPDATE "orden_beneficio_evento"
SET "con_cola" = true, "canal_tipo" = 'media_canal'
WHERE "canal_tipo" = 'media_canal_con_cola';

UPDATE "orden_beneficio_evento"
SET "con_cola" = false, "canal_tipo" = 'media_canal'
WHERE "canal_tipo" = 'media_canal_sin_cola';
