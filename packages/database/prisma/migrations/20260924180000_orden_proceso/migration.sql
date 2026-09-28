-- CreateEnum
CREATE TYPE "OrdenProcesoTipo" AS ENUM ('desposte', 'acondicionamiento');

-- CreateEnum
CREATE TYPE "OrdenProcesoStatus" AS ENUM ('activo', 'inactivo');

-- CreateTable
CREATE TABLE "orden_proceso" (
    "id" UUID NOT NULL,
    "plant_id" UUID NOT NULL,
    "op_number" INTEGER NOT NULL,
    "orden_beneficio_id" UUID NOT NULL,
    "proceso" "OrdenProcesoTipo" NOT NULL,
    "fecha_sacrificio" DATE NOT NULL,
    "fecha_proceso" DATE NOT NULL,
    "client_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "status" "OrdenProcesoStatus" NOT NULL DEFAULT 'activo',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "orden_proceso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "orden_proceso_plant_id_status_idx" ON "orden_proceso"("plant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "orden_proceso_plant_id_op_number_key" ON "orden_proceso"("plant_id", "op_number");

-- AddForeignKey
ALTER TABLE "orden_proceso" ADD CONSTRAINT "orden_proceso_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_proceso" ADD CONSTRAINT "orden_proceso_orden_beneficio_id_fkey" FOREIGN KEY ("orden_beneficio_id") REFERENCES "orden_beneficio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_proceso" ADD CONSTRAINT "orden_proceso_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_proceso" ADD CONSTRAINT "orden_proceso_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_proceso" ADD CONSTRAINT "orden_proceso_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
