-- CreateTable
CREATE TABLE "cliente_producto" (
    "cliente_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cliente_producto_pkey" PRIMARY KEY ("cliente_id","product_id")
);

-- CreateIndex
CREATE INDEX "cliente_producto_product_id_idx" ON "cliente_producto"("product_id");

-- AddForeignKey
ALTER TABLE "cliente_producto" ADD CONSTRAINT "cliente_producto_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cliente_producto" ADD CONSTRAINT "cliente_producto_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
