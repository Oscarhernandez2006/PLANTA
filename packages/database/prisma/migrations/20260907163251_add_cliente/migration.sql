-- CreateTable
CREATE TABLE "cliente" (
    "id" UUID NOT NULL,
    "code" SERIAL NOT NULL,
    "concepto" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cliente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cliente_code_key" ON "cliente"("code");

-- CreateIndex
CREATE UNIQUE INDEX "cliente_concepto_key" ON "cliente"("concepto");
