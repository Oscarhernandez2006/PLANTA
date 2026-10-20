import { navGroups } from '@/components/layout/nav-config';

/** Lo mínimo del usuario que hace falta para evaluar permisos. */
export interface UsuarioPermisos {
  accesoTotal?: boolean;
  modulos?: string[];
}

/** Ruta del propio módulo de permisos. */
export const MODULO_PERMISOS = '/configuracion/permisos';

/** Ruta de módulo (clave de permiso) a la que pertenece una URL, o null si no es un módulo del menú. */
export function moduloDeRuta(pathname: string): string | null {
  for (const g of navGroups) {
    for (const item of g.items) {
      if (pathname === item.to || pathname.startsWith(`${item.to}/`)) return item.to;
    }
  }
  return null;
}

/** ¿El usuario puede ver/usar el módulo? Las páginas fuera del menú (inicio) siempre se permiten. */
export function tieneModulo(user: UsuarioPermisos | null | undefined, modulo: string | null) {
  if (!modulo) return true;
  if (!user) return false;
  return !!user.accesoTotal || (user.modulos ?? []).includes(modulo);
}
