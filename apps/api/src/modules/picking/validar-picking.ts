import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { verificarPinSupervisor } from '../../common/auth/supervisor-pin';

type Db = Prisma.TransactionClient | PrismaService;

/** Código de error para que la pantalla pida la clave del supervisor. */
export const FUERA_DE_PICKING = 'FUERA_DE_PICKING';

/**
 * Si la orden se alistó con picking, solo se despachan las etiquetas pistoleadas en la terminal.
 * Una etiqueta fuera del picking (p. ej. no la encontraron al alistar) entra solo con el PIN
 * de un supervisor. Si la orden no tiene picking no se valida nada.
 */
export async function validarEnPicking(
  db: Db,
  prisma: PrismaService,
  plantId: string,
  orden: { canalDispatchOrderId: string } | { transferOrderId: string },
  codigo: string,
  pin?: string,
) {
  const tienePicking = await db.pickingItem.count({ where: { picking: orden }, take: 1 });
  if (!tienePicking) return;
  const enPicking = await db.pickingItem.count({ where: { codigo, picking: orden }, take: 1 });
  if (enPicking) return;
  if (!pin) {
    throw new BadRequestException({
      statusCode: 400,
      error: FUERA_DE_PICKING,
      message: `${codigo} no pertenece a esta orden: no fue prealistada en el picking.`,
    });
  }
  await verificarPinSupervisor(prisma, plantId, pin);
}
