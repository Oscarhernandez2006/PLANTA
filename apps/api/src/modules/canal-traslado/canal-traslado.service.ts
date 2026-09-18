import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthContext } from '../../common/auth/auth-context';
import { plantDateOnly, plantToday } from '../../common/plant-date';
import { CAVA_CAPACIDAD } from '../canal-caliente/cava-capacidad';
import { CrearTrasladoDto } from './dto/crear-traslado.dto';

@Injectable()
export class CanalTrasladoService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Base del consecutivo global por día: para cada orden devuelve cuántos
   * animales acumulan las órdenes previas del mismo día (por referencia).
   */
  private async consecutivoBases(plantId: string, date: Date) {
    const base = new Map<string, number>();
    const all = await this.prisma.ordenBeneficio.findMany({
      where: { plantId, deletedAt: null, date },
      orderBy: [{ reference: 'asc' }],
      select: { id: true, animalCount: true },
    });
    let acc = 0;
    for (const o of all) {
      base.set(o.id, acc);
      acc += o.animalCount;
    }
    return base;
  }

  /** Busca el animal (canal) cuyo consecutivo del día coincide con el escaneado. */
  async buscarPorConsecutivo(
    ctx: AuthContext,
    consecutivoStr: string,
    dateStr?: string,
  ) {
    const consecutivo = Number(consecutivoStr);
    if (!Number.isInteger(consecutivo) || consecutivo < 1) {
      throw new BadRequestException('Consecutivo inválido.');
    }
    const date = plantDateOnly(dateStr ?? plantToday());
    const bases = await this.consecutivoBases(ctx.plantId, date);

    const ordenes = await this.prisma.ordenBeneficio.findMany({
      where: { plantId: ctx.plantId, deletedAt: null, date },
      orderBy: [{ reference: 'asc' }],
      include: { eventos: true },
    });
    for (const o of ordenes) {
      const base = bases.get(o.id) ?? 0;
      const evento = o.eventos.find((e) => base + e.sequence === consecutivo);
      if (evento) {
        return {
          eventoId: evento.id,
          consecutivo,
          reference: o.reference,
          cliente: o.cliente,
          cava: evento.cava,
        };
      }
    }
    throw new NotFoundException(
      `No se encontró la canal N.º ${consecutivo} en el día ${date.toISOString().slice(0, 10)}.`,
    );
  }

  /** Traslada una canal de su cava actual a otra, dejando constancia (motivo y responsable). */
  async trasladar(ctx: AuthContext, dto: CrearTrasladoDto) {
    const evt = await this.prisma.ordenBeneficioEvento.findFirst({
      where: {
        id: dto.eventoId,
        ordenBeneficio: { plantId: ctx.plantId, deletedAt: null },
      },
      select: { id: true, cava: true },
    });
    if (!evt) throw new NotFoundException('Canal no encontrada.');
    if (evt.cava === dto.cavaDestino) {
      throw new BadRequestException('La canal ya está en esa cava.');
    }

    const capacidad = CAVA_CAPACIDAD[dto.cavaDestino];
    if (capacidad) {
      const ocupadas = await this.prisma.ordenBeneficioEvento.count({
        where: {
          cava: dto.cavaDestino,
          ordenBeneficio: { plantId: ctx.plantId, deletedAt: null },
        },
      });
      if (ocupadas >= capacidad.max) {
        throw new BadRequestException(
          `${dto.cavaDestino} llegó al máximo de ${capacidad.max} canales. Seleccione otra cava.`,
        );
      }
    }

    await this.prisma.$transaction([
      this.prisma.canalTraslado.create({
        data: {
          plantId: ctx.plantId,
          eventoId: evt.id,
          cavaOrigen: evt.cava,
          cavaDestino: dto.cavaDestino,
          motivo: dto.motivo.trim(),
          operatorId: ctx.userId,
        },
      }),
      this.prisma.ordenBeneficioEvento.update({
        where: { id: evt.id },
        data: { cava: dto.cavaDestino },
      }),
    ]);
    return { ok: true };
  }

  /** Historial de traslados del día, para trazabilidad. */
  async historial(ctx: AuthContext, dateStr?: string) {
    const date = plantDateOnly(dateStr ?? plantToday());
    const nextDay = new Date(date);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);

    const rows = await this.prisma.canalTraslado.findMany({
      where: {
        plantId: ctx.plantId,
        createdAt: { gte: date, lt: nextDay },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        evento: {
          include: {
            ordenBeneficio: { select: { reference: true, cliente: true } },
          },
        },
      },
      take: 500,
    });

    const operatorIds = [...new Set(rows.map((r) => r.operatorId))];
    const users = operatorIds.length
      ? await this.prisma.appUser.findMany({
          where: { id: { in: operatorIds } },
          select: { id: true, fullName: true },
        })
      : [];
    const nameById = new Map(users.map((u) => [u.id, u.fullName]));

    return rows.map((r) => ({
      id: r.id,
      reference: r.evento.ordenBeneficio.reference,
      cliente: r.evento.ordenBeneficio.cliente,
      cavaOrigen: r.cavaOrigen,
      cavaDestino: r.cavaDestino,
      motivo: r.motivo,
      operatorName: nameById.get(r.operatorId) ?? '—',
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
