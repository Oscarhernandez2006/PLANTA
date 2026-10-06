-- Código de etiqueta único (pieza: 1 + 9 dígitos, canastilla: 2 + 9 dígitos) y su consecutivo global.
CREATE TABLE "rotulado_codigo_consecutivo" (
    "tipo" TEXT NOT NULL,
    "ultimo" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "rotulado_codigo_consecutivo_pkey" PRIMARY KEY ("tipo")
);

ALTER TABLE "rotulado_etiqueta" ADD COLUMN "codigo" TEXT;
ALTER TABLE "rotulado_canastilla" ADD COLUMN "codigo" TEXT;

-- Asigna código a las etiquetas y canastillas cerradas que ya existían.
WITH n AS (
    SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn FROM "rotulado_etiqueta"
)
UPDATE "rotulado_etiqueta" e SET "codigo" = '1' || lpad(n.rn::text, 9, '0') FROM n WHERE n.id = e.id;

WITH n AS (
    SELECT id, row_number() OVER (ORDER BY cerrada_at, id) AS rn
    FROM "rotulado_canastilla" WHERE "cerrada_at" IS NOT NULL
)
UPDATE "rotulado_canastilla" c SET "codigo" = '2' || lpad(n.rn::text, 9, '0') FROM n WHERE n.id = c.id;

INSERT INTO "rotulado_codigo_consecutivo" ("tipo", "ultimo") VALUES
    ('pieza', (SELECT count(*) FROM "rotulado_etiqueta")),
    ('canastilla', (SELECT count(*) FROM "rotulado_canastilla" WHERE "cerrada_at" IS NOT NULL));

CREATE UNIQUE INDEX "rotulado_etiqueta_codigo_key" ON "rotulado_etiqueta"("codigo");
CREATE UNIQUE INDEX "rotulado_canastilla_codigo_key" ON "rotulado_canastilla"("codigo");
