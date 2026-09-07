-- CreateTable
CREATE TABLE "procedencia" (
    "id" UUID NOT NULL,
    "code" SERIAL NOT NULL,
    "rspp" TEXT,
    "concepto" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "procedencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "procedencia_code_key" ON "procedencia"("code");

-- CreateIndex
CREATE UNIQUE INDEX "procedencia_concepto_key" ON "procedencia"("concepto");
