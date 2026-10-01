-- Piezas Desposte: piezas por canal y unidades por caja/canastilla de cada producto del cliente.
ALTER TABLE "cliente_producto" ADD COLUMN "piezas_por_canal" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "cliente_producto" ADD COLUMN "unds_por_caja" INTEGER NOT NULL DEFAULT 1;
