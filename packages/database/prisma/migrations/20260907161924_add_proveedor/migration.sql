-- CreateTable
CREATE TABLE "proveedor" (
    "id" UUID NOT NULL,
    "code" SERIAL NOT NULL,
    "concepto" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "proveedor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "proveedor_code_key" ON "proveedor"("code");

-- CreateIndex
CREATE UNIQUE INDEX "proveedor_concepto_key" ON "proveedor"("concepto");
