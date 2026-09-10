import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrdenBeneficioStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthContext } from '../../common/auth/auth-context';

@Injectable()
export class InsensibilizacionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Base del consecutivo global por día: para cada orden devuelve cuántos
   * animales acumulan las órdenes previas del mismo día (ordenadas por
   * referencia). Así N.º 1 empieza en 1, y la siguiente continúa la serie.
   */
  private async consecutivoBases(plantId: string, dates: Date[]) {
    const base = new Map<string, number>();
    if (!dates.length) return base;
    const all = await this.prisma.ordenBeneficio.findMany({
      where: { plantId, deletedAt: null, date: { in: dates } },
      orderBy: [{ date: 'asc' }, { reference: 'asc' }],
      select: { id: true, date: true, animalCount: true },
    });
    const running = new Map<string, number>();
    for (const o of all) {
      const key = o.date.toISOString().slice(0, 10);
      const acc = running.get(key) ?? 0;
      base.set(o.id, acc);
      running.set(key, acc + o.animalCount);
    }
    return base;
  }

  /** Órdenes de beneficio pendientes o en proceso de insensibilización. */
  async pendientes(ctx: AuthContext) {
    const rows = await this.prisma.ordenBeneficio.findMany({
      where: {
        plantId: ctx.plantId,
        deletedAt: null,
        status: {
          in: [
            OrdenBeneficioStatus.pendiente,
            OrdenBeneficioStatus.en_insensibilizacion,
          ],
        },
      },
      orderBy: [{ date: 'asc' }, { reference: 'asc' }],
      include: { _count: { select: { eventos: true } } },
      take: 200,
    });
    const bases = await this.consecutivoBases(
      ctx.plantId,
      [...new Set(rows.map((r) => r.date.getTime()))].map((t) => new Date(t)),
    );
    return rows.map((r) => ({
      id: r.id,
      reference: r.reference,
      date: r.date.toISOString().slice(0, 10),
      cliente: r.cliente,
      guias: r.guias,
      animalCount: r.animalCount,
      consecutivoBase: bases.get(r.id) ?? 0,
      status: r.status,
      insensibilizados: r._count.eventos,
    }));
  }

  /** Detalle de una orden con su registro de eventos. */
  async findOne(ctx: AuthContext, ordenBeneficioId: string) {
    const ob = await this.prisma.ordenBeneficio.findFirst({
      where: { id: ordenBeneficioId, plantId: ctx.plantId, deletedAt: null },
      include: { eventos: { orderBy: { sequence: 'asc' } } },
    });
    if (!ob) throw new NotFoundException('Orden de Beneficio no encontrada.');

    const bases = await this.consecutivoBases(ctx.plantId, [ob.date]);

    const operatorIds = [...new Set(ob.eventos.map((e) => e.operatorId))];
    const users = operatorIds.length
      ? await this.prisma.appUser.findMany({
          where: { id: { in: operatorIds } },
          select: { id: true, fullName: true },
        })
      : [];
    const nameById = new Map(users.map((u) => [u.id, u.fullName]));

    return {
      id: ob.id,
      reference: ob.reference,
      date: ob.date.toISOString().slice(0, 10),
      cliente: ob.cliente,
      guias: ob.guias,
      animalCount: ob.animalCount,
      consecutivoBase: bases.get(ob.id) ?? 0,
      status: ob.status,
      insensibilizados: ob.eventos.length,
      eventos: ob.eventos.map((e) => ({
        sequence: e.sequence,
        stunnedAt: e.stunnedAt.toISOString(),
        operatorId: e.operatorId,
        operatorName: nameById.get(e.operatorId) ?? '—',
      })),
    };
  }

  /** Marca el siguiente animal de la orden como insensibilizado. */
  async stunNext(ctx: AuthContext, ordenBeneficioId: string) {
    await this.prisma.$transaction(async (tx) => {
      const ob = await tx.ordenBeneficio.findFirst({
        where: { id: ordenBeneficioId, plantId: ctx.plantId, deletedAt: null },
      });
      if (!ob) throw new NotFoundException('Orden de Beneficio no encontrada.');
      if (ob.status === OrdenBeneficioStatus.procesado) {
        throw new BadRequestException('La orden ya fue procesada.');
      }

      // Serializa el conteo por orden para evitar secuencias duplicadas.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ins:${ordenBeneficioId}`}))`;

      const count = await tx.ordenBeneficioEvento.count({
        where: { ordenBeneficioId },
      });
      if (count >= ob.animalCount) {
        throw new BadRequestException(
          'Todos los animales de la orden ya están insensibilizados.',
        );
      }

      const sequence = count + 1;
      await tx.ordenBeneficioEvento.create({
        data: { ordenBeneficioId, sequence, operatorId: ctx.userId },
      });

      if (ob.status === OrdenBeneficioStatus.pendiente) {
        await tx.ordenBeneficio.update({
          where: { id: ob.id },
          data: { status: OrdenBeneficioStatus.en_insensibilizacion },
        });
      }
      if (sequence >= ob.animalCount) {
        await tx.ordenBeneficio.update({
          where: { id: ob.id },
          data: { status: OrdenBeneficioStatus.procesado },
        });
      }
    });
    return this.findOne(ctx, ordenBeneficioId);
  }

  /** Deshace el último animal marcado (corrige un clic erróneo). */
  async undoLast(ctx: AuthContext, ordenBeneficioId: string) {
    await this.prisma.$transaction(async (tx) => {
      const ob = await tx.ordenBeneficio.findFirst({
        where: { id: ordenBeneficioId, plantId: ctx.plantId, deletedAt: null },
      });
      if (!ob) throw new NotFoundException('Orden de Beneficio no encontrada.');

      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ins:${ordenBeneficioId}`}))`;

      const last = await tx.ordenBeneficioEvento.findFirst({
        where: { ordenBeneficioId },
        orderBy: { sequence: 'desc' },
      });
      if (!last) {
        throw new BadRequestException('No hay registros para deshacer.');
      }

      await tx.ordenBeneficioEvento.delete({ where: { id: last.id } });
      await tx.ordenBeneficio.update({
        where: { id: ob.id },
        data: {
          status:
            last.sequence - 1 === 0
              ? OrdenBeneficioStatus.pendiente
              : OrdenBeneficioStatus.en_insensibilizacion,
        },
      });
    });
    return this.findOne(ctx, ordenBeneficioId);
  }
}
