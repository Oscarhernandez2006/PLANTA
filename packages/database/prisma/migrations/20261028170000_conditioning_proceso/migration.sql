-- Proceso de la orden de acondicionamiento: inyectado o porcionado.
-- CreateEnum
CREATE TYPE "ConditioningProceso" AS ENUM ('inyectado', 'porcionado');

-- AlterTable
ALTER TABLE "conditioning_order" ADD COLUMN "proceso" "ConditioningProceso" NOT NULL DEFAULT 'porcionado';
