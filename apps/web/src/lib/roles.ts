/** Roles de usuario (enum UserRole de la base) y su etiqueta para mostrar. */
export const ROLES = [
  { value: 'desarrollador', label: 'Desarrollador' },
  { value: 'admin', label: 'Administrador' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'operario', label: 'Operario' },
] as const;

export type Rol = (typeof ROLES)[number]['value'];

export const ROL_LABEL: Record<string, string> = Object.fromEntries(ROLES.map((r) => [r.value, r.label]));
