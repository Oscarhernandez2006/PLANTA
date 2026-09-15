-- Correccion: la migracion anterior (20260915210000) elimino por error
-- trace_unit/trace_event, que SI se usan (goods-receipt.service.ts crea un
-- TraceEvent + TraceUnit por cada ingreso para trazabilidad). Se recrean con
-- su estructura original. trace_link se mantiene eliminada (nunca se usa).
CREATE TYPE "TraceUnitType" AS ENUM ('receipt_item', 'cut', 'package', 'shipment');
CREATE TYPE "TraceUnitStatus" AS ENUM ('activa', 'bloqueada', 'consumida', 'despachada');
CREATE TYPE "TraceEventType" AS ENUM ('ingreso', 'desposte', 'empaque', 'despacho');

CREATE TABLE "trace_unit" (
    "id" UUID NOT NULL,
    "plant_id" UUID NOT NULL,
    "unit_type" "TraceUnitType" NOT NULL,
    "entity_id" UUID NOT NULL,
    "public_code" TEXT NOT NULL,
    "status" "TraceUnitStatus" NOT NULL DEFAULT 'activa',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "trace_unit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "trace_event" (
    "id" UUID NOT NULL,
    "plant_id" UUID NOT NULL,
    "event_type" "TraceEventType" NOT NULL,
    "actor_id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB,

    CONSTRAINT "trace_event_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "trace_unit_plant_id_unit_type_idx" ON "trace_unit"("plant_id", "unit_type");
CREATE UNIQUE INDEX "trace_unit_unit_type_entity_id_key" ON "trace_unit"("unit_type", "entity_id");
CREATE INDEX "trace_event_plant_id_event_type_idx" ON "trace_event"("plant_id", "event_type");
CREATE INDEX "trace_event_occurred_at_idx" ON "trace_event"("occurred_at");

ALTER TABLE "trace_unit" ADD CONSTRAINT "trace_unit_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "trace_event" ADD CONSTRAINT "trace_event_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "trace_event" ADD CONSTRAINT "trace_event_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
