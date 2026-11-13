-- CreateTable
CREATE TABLE "taller_actividad" (
    "id" UUID NOT NULL,
    "plant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "accion" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "referencia" TEXT,
    "detalle" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "taller_actividad_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "taller_actividad_plant_id_created_at_idx" ON "taller_actividad"("plant_id", "created_at");
