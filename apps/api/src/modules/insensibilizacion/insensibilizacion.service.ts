import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PesoEnPieStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthContext } from '../../common/auth/auth-context';

@Injectable()
export class InsensibilizacionService {
  constructor(private readonly prisma: PrismaService) {}

  /** Órdenes (reportes de peso en pie) pendientes o en proceso de insensibilización. */
  async pendientes(ctx: AuthContext) {
    const rows = await this.prisma.pesoEnPie.findMany({
      where: {
        plantId: ctx.plantId,
        deletedAt: null,
        status: {
          in: [PesoEnPieStatus.pendiente, PesoEnPieStatus.en_insensibilizacion],
        },
      },
      orderBy: [{ date: 'asc' }, { reference: 'asc' }],
      include: {
        insensibilizacion: { select: { _count: { select: { eventos: true } } } },
      },
      take: 200,
    });
    return rows.map((r) => ({
      id: r.id,
      reference: r.reference,
      date: r.date.toISOString().slice(0, 10),
      guia: r.guia,
      corral: r.corral,
      animalCount: r.animalCount,
      tipoPesaje: r.tipoPesaje,
      pesoPromedioKg: r.pesoPromedioKg == null ? null : Number(r.pesoPromedioKg),
      status: r.status,
      insensibilizados: r.insensibilizacion?._count.eventos ?? 0,
    }));
  }

  /** Detalle de una orden con su registro de eventos. */
  async findOne(ctx: AuthContext, pesoEnPieId: string) {
    const pep = await this.prisma.pesoEnPie.findFirst({
      where: { id: pesoEnPieId, plantId: ctx.plantId, deletedAt: null },
      include: {
        insensibilizacion: {
          include: { eventos: { orderBy: { sequence: 'asc' } } },
        },
      },
    });
    if (!pep) throw new NotFoundException('Reporte no encontrado.');

    const eventos = pep.insensibilizacion?.eventos ?? [];
    const operatorIds = [...new Set(eventos.map((e) => e.operatorId))];
    const users = operatorIds.length
      ? await this.prisma.appUser.findMany({
          where: { id: { in: operatorIds } },
          select: { id: true, fullName: true },
        })
      : [];
    const nameById = new Map(users.map((u) => [u.id, u.fullName]));

    return {
      id: pep.id,
      reference: pep.reference,
      date: pep.date.toISOString().slice(0, 10),
      guia: pep.guia,
      corral: pep.corral,
      animalCount: pep.animalCount,
      tipoPesaje: pep.tipoPesaje,
      pesoPromedioKg:
        pep.pesoPromedioKg == null ? null : Number(pep.pesoPromedioKg),
      status: pep.status,
      insensibilizados: eventos.length,
      insensibilizacionStatus: pep.insensibilizacion?.status ?? null,
      eventos: eventos.map((e) => ({
        sequence: e.sequence,
        stunnedAt: e.stunnedAt.toISOString(),
        operatorId: e.operatorId,
        operatorName: nameById.get(e.operatorId) ?? '—',
      })),
    };
  }

  /** Marca el siguiente animal del lote como insensibilizado. */
  async stunNext(ctx: AuthContext, pesoEnPieId: string) {
    await this.prisma.$transaction(async (tx) => {
      const pep = await tx.pesoEnPie.findFirst({
        where: { id: pesoEnPieId, plantId: ctx.plantId, deletedAt: null },
      });
      if (!pep) throw new NotFoundException('Reporte no encontrado.');
      if (pep.status === PesoEnPieStatus.procesado) {
        throw new BadRequestException('El lote ya fue procesado.');
      }

      // Serializa el conteo por reporte para evitar secuencias duplicadas.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ins:${pesoEnPieId}`}))`;

      let ins = await tx.insensibilizacion.findUnique({
        where: { pesoEnPieId },
      });
      if (!ins) {
        ins = await tx.insensibilizacion.create({
          data: {
            plantId: ctx.plantId,
            pesoEnPieId,
            createdById: ctx.userId,
          },
        });
      }

      const count = await tx.insensibilizacionEvento.count({
        where: { insensibilizacionId: ins.id },
      });
      if (count >= pep.animalCount) {
        throw new BadRequestException(
          'Todos los animales del lote ya están insensibilizados.',
        );
      }

      const sequence = count + 1;
      await tx.insensibilizacionEvento.create({
        data: {
          insensibilizacionId: ins.id,
          sequence,
          operatorId: ctx.userId,
        },
      });

      if (pep.status === PesoEnPieStatus.pendiente) {
        await tx.pesoEnPie.update({
          where: { id: pep.id },
          data: { status: PesoEnPieStatus.en_insensibilizacion },
        });
      }
      if (sequence >= pep.animalCount) {
        await tx.insensibilizacion.update({
          where: { id: ins.id },
          data: { status: 'completada', finishedAt: new Date() },
        });
        await tx.pesoEnPie.update({
          where: { id: pep.id },
          data: { status: PesoEnPieStatus.procesado },
        });
      }
    });
    return this.findOne(ctx, pesoEnPieId);
  }

  /** Deshace el último animal marcado (corrige un clic erróneo). */
  async undoLast(ctx: AuthContext, pesoEnPieId: string) {
    await this.prisma.$transaction(async (tx) => {
      const pep = await tx.pesoEnPie.findFirst({
        where: { id: pesoEnPieId, plantId: ctx.plantId, deletedAt: null },
      });
      if (!pep) throw new NotFoundException('Reporte no encontrado.');

      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ins:${pesoEnPieId}`}))`;

      const ins = await tx.insensibilizacion.findUnique({
        where: { pesoEnPieId },
      });
      if (!ins) {
        throw new BadRequestException('No hay insensibilización iniciada.');
      }
      const last = await tx.insensibilizacionEvento.findFirst({
        where: { insensibilizacionId: ins.id },
        orderBy: { sequence: 'desc' },
      });
      if (!last) {
        throw new BadRequestException('No hay registros para deshacer.');
      }

      await tx.insensibilizacionEvento.delete({ where: { id: last.id } });
      await tx.insensibilizacion.update({
        where: { id: ins.id },
        data: { status: 'en_proceso', finishedAt: null },
      });
      await tx.pesoEnPie.update({
        where: { id: pep.id },
        data: {
          status:
            last.sequence - 1 === 0
              ? PesoEnPieStatus.pendiente
              : PesoEnPieStatus.en_insensibilizacion,
        },
      });
    });
    return this.findOne(ctx, pesoEnPieId);
  }
}
