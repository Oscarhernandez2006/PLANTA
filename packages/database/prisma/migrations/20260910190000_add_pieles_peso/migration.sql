-- AlterTable
ALTER TABLE "orden_beneficio_evento"
  ADD COLUMN "peso_piel_kg" DECIMAL(12,2),
  ADD COLUMN "pielado_at" TIMESTAMPTZ(6),
  ADD COLUMN "piel_operator_id" UUID;
