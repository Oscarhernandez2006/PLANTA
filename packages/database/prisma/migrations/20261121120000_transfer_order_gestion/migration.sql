-- Gestor de órdenes de traslado: quién/cuándo se cerró y anulación con motivo.
ALTER TABLE "transfer_order"
  ADD COLUMN IF NOT EXISTS "closed_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "closed_by" UUID,
  ADD COLUMN IF NOT EXISTS "deleted_by" UUID,
  ADD COLUMN IF NOT EXISTS "motivo_anulacion" TEXT;
