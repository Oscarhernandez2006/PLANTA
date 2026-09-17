-- Destino de las vísceras de un lote (empresa vs. se las lleva el firmante)
-- y constancia (fecha, responsable, observaciones) de su retiro.
CREATE TYPE "SubproductoDestino" AS ENUM ('empresa', 'firmante');

ALTER TABLE "orden_beneficio"
  ADD COLUMN "subproducto_destino" "SubproductoDestino" NOT NULL DEFAULT 'empresa',
  ADD COLUMN "subproducto_retiro_at" TIMESTAMPTZ(6),
  ADD COLUMN "subproducto_retiro_by" UUID,
  ADD COLUMN "subproducto_retiro_observaciones" TEXT;
