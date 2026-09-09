ALTER TABLE "peso_en_pie"
  ADD COLUMN "procedencia" TEXT,
  ADD COLUMN "proveedor" TEXT,
  ADD COLUMN "cliente" TEXT,
  ADD COLUMN "placa" TEXT,
  ADD COLUMN "conductor" TEXT,
  ADD COLUMN "tipo_animal" TEXT,
  ADD COLUMN "lote" TEXT,
  ADD COLUMN "animal_no" TEXT,
  ADD COLUMN "cantidad" INTEGER,
  ADD COLUMN "entrada" DECIMAL(12, 2),
  ADD COLUMN "salida" DECIMAL(12, 2);