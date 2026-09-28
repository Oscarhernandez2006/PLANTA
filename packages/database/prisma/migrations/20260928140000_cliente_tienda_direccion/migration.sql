-- Tiendas: código lo digita el usuario (NIT-codigo); se agregan dirección y ciudad.
ALTER TABLE "cliente_tienda" ALTER COLUMN "codigo" TYPE TEXT USING "codigo"::TEXT;
ALTER TABLE "cliente_tienda" DROP COLUMN "ref";
ALTER TABLE "cliente_tienda" ADD COLUMN "direccion" TEXT;
ALTER TABLE "cliente_tienda" ADD COLUMN "ciudad" TEXT;
