-- El catálogo de subproductos pasa a manejarse en código (con código SIESA),
-- así que la columna deja de depender de un enum fijo en la base de datos.
ALTER TABLE "subproducto_item" ALTER COLUMN "tipo" TYPE VARCHAR(60) USING "tipo"::text;

DROP TYPE "SubproductoItemTipo";
