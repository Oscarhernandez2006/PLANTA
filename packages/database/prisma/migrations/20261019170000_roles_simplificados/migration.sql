-- Roles: solo Desarrollador, Administrador, Supervisor y Operario.
-- Supervisor de desposte pasa a Supervisor; Desposte, Despacho y Calidad pasan a Operario.
CREATE TYPE "UserRole_new" AS ENUM ('desarrollador', 'admin', 'supervisor', 'operario');

ALTER TABLE "app_user" ALTER COLUMN "role" TYPE "UserRole_new" USING (
  CASE "role"::text
    WHEN 'supervisor_desposte' THEN 'supervisor'
    WHEN 'operario_desposte' THEN 'operario'
    WHEN 'despacho' THEN 'operario'
    WHEN 'calidad' THEN 'operario'
    ELSE "role"::text
  END
)::"UserRole_new";

DROP TYPE "UserRole";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
