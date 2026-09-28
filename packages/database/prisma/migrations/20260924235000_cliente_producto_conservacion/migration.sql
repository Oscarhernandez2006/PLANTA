ALTER TABLE "cliente_producto" ADD COLUMN "tipo" TEXT NOT NULL DEFAULT 'TERMINADO';
ALTER TABLE "cliente_producto" ADD COLUMN "ref_plu_sku" TEXT;
ALTER TABLE "cliente_producto" ADD COLUMN "refrigerado_dias" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "cliente_producto" ADD COLUMN "refrigerado_temp" TEXT NOT NULL DEFAULT '0°C A 4°C';
ALTER TABLE "cliente_producto" ADD COLUMN "congelado_dias" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "cliente_producto" ADD COLUMN "congelado_temp" TEXT NOT NULL DEFAULT '-18°C A -25°C';
