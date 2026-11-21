import { Logger } from '@nestjs/common';
import { DispatchOrderStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type Seleccion = {
  etiquetaId: string | null;
  canastillaId: string | null;
  acondEtiquetaId?: string | null;
  postaItemId?: string | null;
  productId: string;
};

const logger = new Logger('AdvertenciaAntiguedad');

export async function advertenciaAntiguedad(
  prisma: PrismaService, plantId: string, clienteId: string, seleccion: Seleccion,
): Promise<string | null> {
  try {
    const seleccionadas = seleccion.etiquetaId || seleccion.canastillaId
      ? await prisma.rotuladoEtiqueta.findMany({
          where: {
            plantId, deletedAt: null,
            ...(seleccion.etiquetaId ? { id: seleccion.etiquetaId } : { canastillaId: seleccion.canastillaId }),
          },
          select: { fechaVencimiento: true },
        })
      : seleccion.acondEtiquetaId
        ? await prisma.acondicionamientoEtiqueta.findMany({
            where: { id: seleccion.acondEtiquetaId, plantId }, select: { fechaVencimiento: true },
          })
        : await prisma.postaReceiptItem.findMany({
            where: { id: seleccion.postaItemId ?? '', plantId }, select: { fechaVencimiento: true },
          });
    if (!seleccionadas.length || seleccionadas.some((e) => !e.fechaVencimiento)) {
      return 'No se puede comparar la antigüedad: la selección no tiene fecha de vencimiento.';
    }
    const fecha = new Date(Math.max(...seleccionadas.map((e) => e.fechaVencimiento!.getTime())));
    const [rotulado, acond, posta] = await Promise.all([
      prisma.rotuladoEtiqueta.findFirst({
        where: {
          plantId, productId: seleccion.productId, deletedAt: null, bodega: { clienteId },
          fechaVencimiento: { lt: fecha }, traslado: { is: null }, despacho: { is: null },
          ...(seleccion.etiquetaId ? { id: { not: seleccion.etiquetaId } } : {}),
          AND: [
            { OR: [{ canastillaId: null }, { canastilla: { traslado: { is: null }, despacho: { is: null } } }] },
            ...(seleccion.canastillaId ? [{ OR: [{ canastillaId: null }, { canastillaId: { not: seleccion.canastillaId } }] }] : []),
          ],
        },
        orderBy: { fechaVencimiento: 'asc' }, select: { fechaVencimiento: true },
      }),
      prisma.acondicionamientoEtiqueta.findFirst({
        where: {
          plantId, productId: seleccion.productId, deletedAt: null, bodega: { clienteId },
          fechaVencimiento: { lt: fecha }, despacho: { is: null },
          ...(seleccion.acondEtiquetaId ? { id: { not: seleccion.acondEtiquetaId } } : {}),
        },
        orderBy: { fechaVencimiento: 'asc' }, select: { fechaVencimiento: true },
      }),
      prisma.postaReceiptItem.findFirst({
        where: {
          plantId, productId: seleccion.productId, fechaVencimiento: { lt: fecha }, despacho: { is: null },
          receiptOrder: { clienteId, deletedAt: null, status: DispatchOrderStatus.facturado, bodegaId: { not: null } },
          ...(seleccion.postaItemId ? { id: { not: seleccion.postaItemId } } : {}),
        },
        orderBy: { fechaVencimiento: 'asc' }, select: { fechaVencimiento: true },
      }),
    ]);
    const fechas = [rotulado?.fechaVencimiento, acond?.fechaVencimiento, posta?.fechaVencimiento]
      .filter((f): f is Date => !!f);
    if (!fechas.length) return null;
    const masAntigua = new Date(Math.min(...fechas.map((f) => f.getTime()))).toISOString().slice(0, 10);
    return `Hay producto disponible del mismo cliente y referencia que vence antes (${masAntigua}). Puedes continuar.`;
  } catch (error) {
    logger.error('No se pudo comparar la antigüedad del inventario', error instanceof Error ? error.stack : String(error));
    return 'No se pudo verificar si hay producto más antiguo. Puedes continuar.';
  }
}
