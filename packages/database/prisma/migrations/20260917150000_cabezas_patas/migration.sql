-- Marca si el lote requiere tiquete de cabeza y patas al insensibilizar
-- cada animal (info del animal + 4 patas).
ALTER TABLE "orden_beneficio"
  ADD COLUMN "cabezas_patas" BOOLEAN NOT NULL DEFAULT false;
