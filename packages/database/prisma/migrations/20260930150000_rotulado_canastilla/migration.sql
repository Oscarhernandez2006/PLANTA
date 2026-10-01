-- Canastillas de Rotulado Desposte y marca de sobrante en etiquetas.
CREATE TABLE "rotulado_canastilla" (
    "id" UUID NOT NULL,
    "plant_id" UUID NOT NULL,
    "production_order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "tienda_id" UUID NOT NULL,
    "numero" INTEGER NOT NULL,
    "tara_kg" DECIMAL(12,2),
    "bruto_kg" DECIMAL(12,2),
    "neto_kg" DECIMAL(12,2),
    "unds" INTEGER,
    "cerrada_at" TIMESTAMPTZ(6),
    "cerrada_by" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rotulado_canastilla_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rotulado_canastilla_production_order_id_product_id_numero_key"
    ON "rotulado_canastilla"("production_order_id", "product_id", "numero");
CREATE INDEX "rotulado_canastilla_production_order_id_product_id_cerrada_at_idx"
    ON "rotulado_canastilla"("production_order_id", "product_id", "cerrada_at");

ALTER TABLE "rotulado_canastilla" ADD CONSTRAINT "rotulado_canastilla_production_order_id_fkey"
    FOREIGN KEY ("production_order_id") REFERENCES "production_order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rotulado_canastilla" ADD CONSTRAINT "rotulado_canastilla_tienda_id_fkey"
    FOREIGN KEY ("tienda_id") REFERENCES "cliente_tienda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "rotulado_etiqueta" ADD COLUMN "sobrante" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "rotulado_etiqueta" ADD COLUMN "canastilla_id" UUID;
CREATE INDEX "rotulado_etiqueta_canastilla_id_idx" ON "rotulado_etiqueta"("canastilla_id");
ALTER TABLE "rotulado_etiqueta" ADD CONSTRAINT "rotulado_etiqueta_canastilla_id_fkey"
    FOREIGN KEY ("canastilla_id") REFERENCES "rotulado_canastilla"("id") ON DELETE SET NULL ON UPDATE CASCADE;
