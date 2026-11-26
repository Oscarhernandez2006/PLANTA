import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import { verificarPinSupervisor } from '../../common/auth/supervisor-pin';
import { avancePreorden, nombrePreorden } from './avance-preorden';

/** Código de error para que la pantalla pida la clave del supervisor al cerrar. */
export const PREORDENES_INCOMPLETAS = 'PREORDENES_INCOMPLETAS';

/**
 * La orden solo se cierra con todas sus pre-órdenes (con orden de compra) alistadas al 100 %.
 * Si alguna está incompleta, el cierre requiere el PIN de un supervisor.
 */
export async function exigirPreordenesCompletas(
  prisma: PrismaService,
  plantId: string,
  orden: { canalDispatchOrderId: string } | { transferOrderId: string },
  pin?: string,
) {
  const preordenes = await prisma.picking.findMany({
    where: orden,
    select: {
      ocNumero: true,
      tiendaNombre: true,
      lineas: { select: { productId: true, kgPedidos: true } },
      items: { select: { productId: true, netoEtiquetaKg: true } },
    },
  });
  const incompletas = preordenes
    .map((p) => {
      const { porcentaje } = avancePreorden(
        p.lineas.map((l) => ({
          productoId: l.productId,
          productoCodigo: '',
          productoNombre: '',
          plu: null,
          productoCliente: null,
          kgPedidos: Number(l.kgPedidos),
        })),
        p.items.map((i) => ({
          productoId: i.productId,
          productoCodigo: '',
          productoNombre: '',
          netoEtiquetaKg: Number(i.netoEtiquetaKg),
          netoPesadoKg: null,
        })),
      ).totales;
      return { nombre: nombrePreorden(p), porcentaje };
    })
    .filter((p): p is { nombre: string; porcentaje: number } => p.porcentaje !== null && p.porcentaje < 100);
  if (!incompletas.length) return null;
  if (!pin) {
    throw new BadRequestException({
      statusCode: 400,
      error: PREORDENES_INCOMPLETAS,
      message: `Hay ${incompletas.length} pre-orden(es) sin alistar al 100 %: ${incompletas
        .map((p) => `${p.nombre} (${p.porcentaje.toLocaleString('es-CO')} %)`)
        .join(', ')}. Para cerrar se requiere la clave del supervisor.`,
      preordenes: incompletas,
    });
  }
  return verificarPinSupervisor(prisma, plantId, pin);
}
