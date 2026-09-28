-- Bodegas internas del software (una por defecto por cliente, con su nombre).
CREATE TABLE "bodega" (
    "id" UUID NOT NULL,
    "code" SERIAL NOT NULL,
    "cliente_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "bodega_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bodega_code_key" ON "bodega"("code");
CREATE UNIQUE INDEX "bodega_cliente_id_nombre_key" ON "bodega"("cliente_id", "nombre");

ALTER TABLE "bodega" ADD CONSTRAINT "bodega_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Bodega por defecto para los clientes existentes.
INSERT INTO "bodega" ("id", "cliente_id", "nombre", "updated_at")
SELECT gen_random_uuid(), c."id", c."concepto", CURRENT_TIMESTAMP
FROM "cliente" c
ORDER BY c."code";
