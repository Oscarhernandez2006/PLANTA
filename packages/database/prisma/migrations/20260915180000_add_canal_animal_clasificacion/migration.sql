-- Clasificación por animal en Canal Caliente: tipo, bodega, cava, destino, observaciones.
CREATE TYPE "CanalAnimalTipo" AS ENUM ('vaca', 'novilla', 'toro', 'novillo', 'bufala', 'bufalo');

ALTER TABLE "orden_beneficio_evento"
  ADD COLUMN "canal_animal_tipo" "CanalAnimalTipo",
  ADD COLUMN "bodega" TEXT,
  ADD COLUMN "cava" TEXT,
  ADD COLUMN "destino" TEXT,
  ADD COLUMN "observaciones" TEXT;
