-- CreateTable
CREATE TABLE "conductor" (
    "id" UUID NOT NULL,
    "code" SERIAL NOT NULL,
    "concepto" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "conductor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "conductor_code_key" ON "conductor"("code");

-- CreateIndex
CREATE UNIQUE INDEX "conductor_concepto_key" ON "conductor"("concepto");
