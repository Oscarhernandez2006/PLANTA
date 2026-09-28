-- CIZQ y CDER son piezas independientes (no una elección de con/sin cola):
-- se agrega un tipo genérico "media_canal" para cuando se elige cualquiera
-- de las dos. La clasificación con/sin cola pasa a ser un campo aparte
-- (con_cola en orden_beneficio_evento, ver migración siguiente).
ALTER TYPE "CanalTipo" ADD VALUE IF NOT EXISTS 'media_canal';
