-- CreateTable
CREATE TABLE "dispatch_order_item" (
    "id" UUID NOT NULL,
    "dispatch_order_id" UUID NOT NULL,
    "canal_pieza_id" UUID NOT NULL,
    "cava_origen" TEXT NOT NULL,
    "peso_caliente_kg" DECIMAL(12,2) NOT NULL,
    "despacho_kg" DECIMAL(12,2),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispatch_order_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dispatch_order_item_canal_pieza_id_key" ON "dispatch_order_item"("canal_pieza_id");

-- CreateIndex
CREATE INDEX "dispatch_order_item_dispatch_order_id_idx" ON "dispatch_order_item"("dispatch_order_id");

-- AddForeignKey
ALTER TABLE "dispatch_order_item" ADD CONSTRAINT "dispatch_order_item_dispatch_order_id_fkey" FOREIGN KEY ("dispatch_order_id") REFERENCES "dispatch_order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_order_item" ADD CONSTRAINT "dispatch_order_item_canal_pieza_id_fkey" FOREIGN KEY ("canal_pieza_id") REFERENCES "canal_pieza"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_order_item" ADD CONSTRAINT "dispatch_order_item_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
