import { BadRequestException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import type { PrismaService } from '../../prisma/prisma.service';

/**
 * Valida que el PIN sea de algún supervisor o "Autorizador de operaciones" (Configuración →
 * Permisos) activo de la planta y devuelve su id. Cualquiera de ellos puede autorizar.
 */
export async function verificarPinSupervisor(prisma: PrismaService, plantId: string, pin: string) {
  const supervisores = await prisma.appUser.findMany({
    where: {
      plantId,
      active: true,
      pinHash: { not: null },
      OR: [{ role: UserRole.supervisor }, { autorizador: true }],
    },
    select: { id: true, pinHash: true },
  });
  for (const s of supervisores) {
    if (await bcrypt.compare(pin, s.pinHash!)) return s.id;
  }
  // 400 (no 401): un PIN mal digitado no debe cerrar la sesión del usuario.
  throw new BadRequestException('PIN inválido: no corresponde a ningún supervisor ni autorizador.');
}
