-- El código de barras pasa a ser lote (OP, 7 dígitos) + código de producto + pieza (4 dígitos)
-- o + 'C' + canastilla (3 dígitos); deja de usarse el consecutivo global.
UPDATE "rotulado_etiqueta" e
SET "codigo" = lpad(o."op_number"::text, 7, '0')
    || regexp_replace(p."codigo", '\D', '', 'g')
    || lpad(e."pieza"::text, 4, '0')
FROM "production_order" o, "product" p
WHERE o."id" = e."production_order_id" AND p."id" = e."product_id";

UPDATE "rotulado_canastilla" c
SET "codigo" = lpad(o."op_number"::text, 7, '0')
    || regexp_replace(p."codigo", '\D', '', 'g')
    || 'C' || lpad(c."numero"::text, 3, '0')
FROM "production_order" o, "product" p
WHERE o."id" = c."production_order_id" AND p."id" = c."product_id";

DROP TABLE "rotulado_codigo_consecutivo";
