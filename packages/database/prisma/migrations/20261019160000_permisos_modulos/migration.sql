-- Permisos por módulo (Configuración → Permisos). Por defecto ningún usuario
-- tiene módulos: se otorgan desde la app (o acceso total).
ALTER TABLE "app_user" ADD COLUMN "acceso_total" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "modulos" TEXT[] DEFAULT ARRAY[]::TEXT[];
