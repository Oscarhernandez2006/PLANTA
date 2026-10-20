import { ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuthContext } from './auth-context';

/** Rutas de módulos del menú que protegen endpoints de configuración. */
export const MODULO_PERMISOS = '/configuracion/permisos';
export const MODULO_USUARIOS = '/configuracion/usuarios';

/** Lanza 403 si el usuario no tiene el módulo (ni acceso total). */
export async function asegurarModulo(prisma: PrismaService, ctx: AuthContext, modulo: string) {
  const yo = await prisma.appUser.findUnique({
    where: { id: ctx.userId },
    select: { accesoTotal: true, modulos: true, active: true },
  });
  if (!yo?.active || !(yo.accesoTotal || yo.modulos.includes(modulo))) {
    throw new ForbiddenException('No tienes acceso a este módulo.');
  }
}
