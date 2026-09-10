-- Subproductos: pesos de vísceras blancas y rojas por animal caído.
ALTER TABLE "orden_beneficio_evento"
  ADD COLUMN "peso_visc_blancas_kg" DECIMAL(12,2),
  ADD COLUMN "visc_blancas_at" TIMESTAMPTZ(6),
  ADD COLUMN "visc_blancas_operator_id" UUID,
  ADD COLUMN "peso_visc_rojas_kg" DECIMAL(12,2),
  ADD COLUMN "visc_rojas_at" TIMESTAMPTZ(6),
  ADD COLUMN "visc_rojas_operator_id" UUID;
