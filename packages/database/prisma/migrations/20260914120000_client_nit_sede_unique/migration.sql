-- Un cliente (NIT) puede tener varias sedes: el único ahora es (nit, sede).
DROP INDEX "client_nit_key";
CREATE UNIQUE INDEX "client_nit_sede_key" ON "client"("nit", "sede");
