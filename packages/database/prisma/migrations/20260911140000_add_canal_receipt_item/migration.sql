-- CreateTable
CREATE TABLE "canal_receipt_item" (
    "id" UUID NOT NULL,
    "receipt_order_id" UUID NOT NULL,
    "plant_id" UUID NOT NULL,
    "codigo" INTEGER NOT NULL,
    "cava" INTEGER NOT NULL,
    "peso_kg" DECIMAL(12,2) NOT NULL,
    "guia" TEXT,
    "lote" TEXT,
    "identificacion" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "canal_receipt_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "canal_receipt_item_receipt_order_id_idx" ON "canal_receipt_item"("receipt_order_id");

-- AddForeignKey
ALTER TABLE "canal_receipt_item" ADD CONSTRAINT "canal_receipt_item_receipt_order_id_fkey" FOREIGN KEY ("receipt_order_id") REFERENCES "canal_receipt_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canal_receipt_item" ADD CONSTRAINT "canal_receipt_item_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canal_receipt_item" ADD CONSTRAINT "canal_receipt_item_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
