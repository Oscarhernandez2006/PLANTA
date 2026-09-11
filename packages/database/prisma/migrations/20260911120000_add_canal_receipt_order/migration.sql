-- CreateTable
CREATE TABLE "canal_receipt_order" (
    "id" UUID NOT NULL,
    "plant_id" UUID NOT NULL,
    "receipt_number" INTEGER NOT NULL,
    "registration_date" DATE NOT NULL,
    "process_date" DATE NOT NULL,
    "client_id" UUID NOT NULL,
    "status" "DispatchOrderStatus" NOT NULL DEFAULT 'activo',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "canal_receipt_order_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "canal_receipt_order_plant_id_status_idx" ON "canal_receipt_order"("plant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "canal_receipt_order_plant_id_receipt_number_key" ON "canal_receipt_order"("plant_id", "receipt_number");

-- AddForeignKey
ALTER TABLE "canal_receipt_order" ADD CONSTRAINT "canal_receipt_order_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canal_receipt_order" ADD CONSTRAINT "canal_receipt_order_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canal_receipt_order" ADD CONSTRAINT "canal_receipt_order_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
