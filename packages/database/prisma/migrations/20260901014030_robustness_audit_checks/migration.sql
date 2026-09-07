-- ============================================================================
-- Robustez de datos: CHECK constraints + auditoría por triggers
-- Entidades críticas de este módulo: goods_receipt, goods_receipt_item
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) CHECK constraints (capa 3 de validación: base de datos)
-- ---------------------------------------------------------------------------

-- quarter_type solo puede existir cuando unit_form = 'cuarto', y es obligatorio en ese caso.
ALTER TABLE "goods_receipt_item"
  ADD CONSTRAINT "chk_gri_quarter_type"
  CHECK (
    ("unit_form" = 'cuarto' AND "quarter_type" IS NOT NULL)
    OR
    ("unit_form" <> 'cuarto' AND "quarter_type" IS NULL)
  );

-- Pesos siempre positivos.
ALTER TABLE "goods_receipt_item"
  ADD CONSTRAINT "chk_gri_weight_positive"
  CHECK ("weight_kg" > 0);

-- ---------------------------------------------------------------------------
-- 2) Función de auditoría genérica
--    Escribe en la tabla "<tabla>_audit". El usuario de aplicación se toma de
--    la variable de sesión app.current_user_id (la setea el backend por
--    transacción con SET LOCAL). Si no está seteada, queda NULL.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_audit() RETURNS trigger AS $$
DECLARE
  v_user uuid;
BEGIN
  BEGIN
    v_user := nullif(current_setting('app.current_user_id', true), '')::uuid;
  EXCEPTION WHEN others THEN
    v_user := NULL;
  END;

  IF (TG_OP = 'DELETE') THEN
    EXECUTE format(
      'INSERT INTO %I (operation, row_id, changed_by, old_data) VALUES ($1,$2,$3,$4)',
      TG_TABLE_NAME || '_audit'
    ) USING TG_OP, OLD.id, v_user, to_jsonb(OLD);
    RETURN OLD;

  ELSIF (TG_OP = 'UPDATE') THEN
    EXECUTE format(
      'INSERT INTO %I (operation, row_id, changed_by, old_data, new_data) VALUES ($1,$2,$3,$4,$5)',
      TG_TABLE_NAME || '_audit'
    ) USING TG_OP, NEW.id, v_user, to_jsonb(OLD), to_jsonb(NEW);
    RETURN NEW;

  ELSIF (TG_OP = 'INSERT') THEN
    EXECUTE format(
      'INSERT INTO %I (operation, row_id, changed_by, new_data) VALUES ($1,$2,$3,$4)',
      TG_TABLE_NAME || '_audit'
    ) USING TG_OP, NEW.id, v_user, to_jsonb(NEW);
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- 3) Tablas de auditoría separadas por entidad crítica
-- ---------------------------------------------------------------------------
CREATE TABLE "goods_receipt_audit" (
  "audit_id"   bigserial PRIMARY KEY,
  "operation"  text        NOT NULL,
  "row_id"     uuid,
  "changed_at" timestamptz NOT NULL DEFAULT now(),
  "changed_by" uuid,
  "old_data"   jsonb,
  "new_data"   jsonb
);
CREATE INDEX "idx_goods_receipt_audit_row" ON "goods_receipt_audit" ("row_id");
CREATE INDEX "idx_goods_receipt_audit_changed_at" ON "goods_receipt_audit" ("changed_at");

CREATE TABLE "goods_receipt_item_audit" (
  "audit_id"   bigserial PRIMARY KEY,
  "operation"  text        NOT NULL,
  "row_id"     uuid,
  "changed_at" timestamptz NOT NULL DEFAULT now(),
  "changed_by" uuid,
  "old_data"   jsonb,
  "new_data"   jsonb
);
CREATE INDEX "idx_goods_receipt_item_audit_row" ON "goods_receipt_item_audit" ("row_id");
CREATE INDEX "idx_goods_receipt_item_audit_changed_at" ON "goods_receipt_item_audit" ("changed_at");

-- ---------------------------------------------------------------------------
-- 4) Triggers AFTER INSERT/UPDATE/DELETE en entidades críticas
-- ---------------------------------------------------------------------------
CREATE TRIGGER "trg_audit_goods_receipt"
  AFTER INSERT OR UPDATE OR DELETE ON "goods_receipt"
  FOR EACH ROW EXECUTE FUNCTION fn_audit();

CREATE TRIGGER "trg_audit_goods_receipt_item"
  AFTER INSERT OR UPDATE OR DELETE ON "goods_receipt_item"
  FOR EACH ROW EXECUTE FUNCTION fn_audit();