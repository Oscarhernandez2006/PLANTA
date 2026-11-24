-- Pre-orden asignada a un alistador: solo él la alista hasta que la libere.
ALTER TABLE "picking"
  ADD COLUMN IF NOT EXISTS "asignado_a" UUID,
  ADD COLUMN IF NOT EXISTS "asignado_at" TIMESTAMPTZ(6);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'picking_asignado_a_fkey') THEN
    ALTER TABLE "picking" ADD CONSTRAINT "picking_asignado_a_fkey" FOREIGN KEY ("asignado_a") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
