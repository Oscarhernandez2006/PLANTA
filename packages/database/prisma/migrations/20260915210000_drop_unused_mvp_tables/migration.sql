-- Elimina tablas huerfanas del MVP original (Desposte/Empaque/Despacho/Trazabilidad
-- genericos) que nunca se usaron: la app real se construyo con otros modulos
-- (peso-camion, peso-en-pie, insensibilizacion, canal-receipt, canal-caliente,
-- pieles, subproductos, orden-beneficio, dispatch-order, client/cliente).
-- Verificado antes de aplicar: 0 filas en las 12 tablas y ningun codigo las consulta.
DROP TABLE IF EXISTS "trace_link" CASCADE;
DROP TABLE IF EXISTS "trace_event" CASCADE;
DROP TABLE IF EXISTS "trace_unit" CASCADE;
DROP TABLE IF EXISTS "shipment_item" CASCADE;
DROP TABLE IF EXISTS "shipment" CASCADE;
DROP TABLE IF EXISTS "customer" CASCADE;
DROP TABLE IF EXISTS "package_item" CASCADE;
DROP TABLE IF EXISTS "package" CASCADE;
DROP TABLE IF EXISTS "cut" CASCADE;
DROP TABLE IF EXISTS "cutting_record" CASCADE;
DROP TABLE IF EXISTS "cutting_order" CASCADE;
DROP TABLE IF EXISTS "product_type" CASCADE;

DROP TYPE IF EXISTS "TraceRelation";
DROP TYPE IF EXISTS "TraceEventType";
DROP TYPE IF EXISTS "TraceUnitStatus";
DROP TYPE IF EXISTS "TraceUnitType";
DROP TYPE IF EXISTS "ShipmentStatus";
DROP TYPE IF EXISTS "PackageStatus";
DROP TYPE IF EXISTS "ContainerType";
DROP TYPE IF EXISTS "ProductCategory";
DROP TYPE IF EXISTS "CutStatus";
DROP TYPE IF EXISTS "CuttingOrderStatus";
