-- Trazabilidad hacia atrás: guarda a qué guía de Peso en Camión (BC) y
-- Peso en Pie (BP) queda asociado cada lote de Orden de Beneficio.
ALTER TABLE "orden_beneficio" ADD COLUMN "pc_reference" INTEGER;
ALTER TABLE "orden_beneficio" ADD COLUMN "bp_reference" INTEGER;
