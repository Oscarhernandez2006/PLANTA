import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthContext } from '../../common/auth/auth-context';
import { RegistrarPielDto } from './dto/registrar-piel.dto';

function today() {
  return new Date();
}

function dateOnly(value?: string) {
  const d = value ? new Date(`${value}T00:00:00Z`) : today();
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

@Injectable()
export class PielesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Base del consecutivo global por día: para cada orden devuelve cuántos
   * animales acumulan las órdenes previas del mismo día (por referencia).
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

  /** Animales caídos (insensibilizados) que aún no tienen peso de piel. */
  async pendientes(ctx: AuthContext, dateStr?: string) {
    const date = dateOnly(dateStr);
    const evts = await this.prisma.ordenBeneficioEvento.findMany({
      where: {
        pesoPielKg: null,
        ordenBeneficio: { plantId: ctx.plantId, deletedAt: null, date },
      },
      orderBy: { stunnedAt: 'asc' },
      include: {
        ordenBeneficio: {
          select: {
            id: true,
            cliente: true,
            guias: true,
            date: true,
            reference: true,
          },
        },
      },
    });

    const bases = await this.consecutivoBases(ctx.plantId, [date]);
    return evts.map((e) => ({
      eventoId: e.id,
      ordenBeneficioId: e.ordenBeneficio.id,
      reference: e.ordenBeneficio.reference,
      cliente: e.ordenBeneficio.cliente,
      guias: e.ordenBeneficio.guias,
      date: e.ordenBeneficio.date.toISOString().slice(0, 10),
      consecutivo: (bases.get(e.ordenBeneficio.id) ?? 0) + e.sequence,
      stunnedAt: e.stunnedAt.toISOString(),
    }));
  }

  /** Animales ya pesados en el día. */
  async pesados(ctx: AuthContext, dateStr?: string) {
    const date = dateOnly(dateStr);
    const evts = await this.prisma.ordenBeneficioEvento.findMany({
      where: {
        pesoPielKg: { not: null },
        ordenBeneficio: { plantId: ctx.plantId, deletedAt: null, date },
      },
      orderBy: { pieladoAt: 'desc' },
      include: {
        ordenBeneficio: {
          select: { id: true, cliente: true, guias: true, reference: true },
        },
      },
    });

    const operatorIds = [
      ...new Set(evts.map((e) => e.pielOperatorId).filter((x): x is string => !!x)),
    ];
    const users = operatorIds.length
      ? await this.prisma.appUser.findMany({
          where: { id: { in: operatorIds } },
          select: { id: true, fullName: true },
        })
      : [];
    const nameById = new Map(users.map((u) => [u.id, u.fullName]));
    const bases = await this.consecutivoBases(ctx.plantId, [date]);

    return evts.map((e) => ({
      eventoId: e.id,
      cliente: e.ordenBeneficio.cliente,
      guias: e.ordenBeneficio.guias,
      consecutivo: (bases.get(e.ordenBeneficio.id) ?? 0) + e.sequence,
      pesoKg: Number(e.pesoPielKg),
      pieladoAt: e.pieladoAt?.toISOString() ?? null,
      operatorName: e.pielOperatorId
        ? (nameById.get(e.pielOperatorId) ?? '—')
        : '—',
    }));
  }

  /** Registra el peso de la piel de un animal caído. */
  async registrar(ctx: AuthContext, dto: RegistrarPielDto) {
    const evt = await this.prisma.ordenBeneficioEvento.findFirst({
      where: {
        id: dto.eventoId,
        ordenBeneficio: { plantId: ctx.plantId, deletedAt: null },
      },
      select: { id: true, pesoPielKg: true },
    });
    if (!evt) throw new NotFoundException('Animal no encontrado.');
    if (evt.pesoPielKg != null) {
      throw new BadRequestException('Este animal ya tiene peso registrado.');
    }
    await this.prisma.ordenBeneficioEvento.update({
      where: { id: evt.id },
      data: {
        pesoPielKg: dto.pesoKg,
        pieladoAt: new Date(),
        pielOperatorId: ctx.userId,
      },
    });
    return { ok: true };
  }
}
