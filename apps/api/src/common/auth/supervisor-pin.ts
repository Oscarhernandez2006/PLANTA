import { UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import type { PrismaService } from '../../prisma/prisma.service';

/**
 * Valida que el PIN sea de algún supervisor activo de la planta y devuelve su id.
 * Cualquier supervisor puede autorizar; queda registrado cuál fue.
 */
export async function verificarPinSupervisor(prisma: PrismaService, plantId: string, pin: string) {
  const supervisores = await prisma.appUser.findMany({
    where: { plantId, role: UserRole.supervisor, active: true, pinHash: { not: null } },
    select: { id: true, pinHash: true },
  });
  for (const s of supervisores) {
    if (await bcrypt.compare(pin, s.pinHash!)) return s.id;
  }
  throw new UnauthorizedException('PIN inválido: no corresponde a ningún supervisor.');
}
