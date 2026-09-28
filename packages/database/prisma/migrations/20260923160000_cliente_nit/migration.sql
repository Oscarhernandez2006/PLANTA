-- Nit opcional del catálogo Cliente (para mostrarlo junto al consecutivo de OB en Sacrificio).
ALTER TABLE "cliente" ADD COLUMN "nit" TEXT;

-- Dato de prueba: NIT del cliente de pruebas usado en los escenarios de test.
UPDATE "cliente" SET "nit" = '1044616409' WHERE "concepto" = 'CLIENTE PRUEBA';
