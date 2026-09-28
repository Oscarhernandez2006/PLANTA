-- Tiendas de cada cliente.
CREATE TABLE "cliente_tienda" (
    "id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "codigo" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "ref" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cliente_tienda_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cliente_tienda_cliente_id_codigo_key" ON "cliente_tienda"("cliente_id", "codigo");
CREATE UNIQUE INDEX "cliente_tienda_cliente_id_nombre_key" ON "cliente_tienda"("cliente_id", "nombre");

ALTER TABLE "cliente_tienda" ADD CONSTRAINT "cliente_tienda_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
