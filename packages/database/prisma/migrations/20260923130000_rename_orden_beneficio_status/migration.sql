ALTER TYPE "OrdenBeneficioStatus" RENAME VALUE 'pendiente' TO 'activo';
ALTER TYPE "OrdenBeneficioStatus" RENAME VALUE 'en_insensibilizacion' TO 'inactivo';
ALTER TABLE "orden_beneficio" ALTER COLUMN "status" SET DEFAULT 'activo';
