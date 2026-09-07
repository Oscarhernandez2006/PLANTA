-- CreateEnum
CREATE TYPE "DispatchOrderStatus" AS ENUM ('activo', 'inactivo', 'facturado');

-- CreateEnum
CREATE TYPE "DispatchOrderType" AS ENUM ('mp_a_proceso');

-- CreateTable
CREATE TABLE "client" (
    "id" UUID NOT NULL,
    "nit" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sede" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispatch_order" (
    "id" UUID NOT NULL,
    "plant_id" UUID NOT NULL,
    "od_number" INTEGER NOT NULL,
    "registration_date" DATE NOT NULL,
    "process_date" DATE NOT NULL,
    "client_id" UUID NOT NULL,
    "status" "DispatchOrderStatus" NOT NULL DEFAULT 'activo',
    "type" "DispatchOrderType" NOT NULL DEFAULT 'mp_a_proceso',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "dispatch_order_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "client_nit_key" ON "client"("nit");

-- CreateIndex
CREATE INDEX "dispatch_order_plant_id_status_idx" ON "dispatch_order"("plant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "dispatch_order_plant_id_od_number_key" ON "dispatch_order"("plant_id", "od_number");

-- AddForeignKey
ALTER TABLE "dispatch_order" ADD CONSTRAINT "dispatch_order_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_order" ADD CONSTRAINT "dispatch_order_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_order" ADD CONSTRAINT "dispatch_order_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
