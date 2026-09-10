import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthContext } from '../../common/auth/auth-context';
import { RegistrarSubproductoDto } from './dto/registrar-subproducto.dto';

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
export class SubproductosService {
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

  /** Lotes (órdenes) del día que ya tienen animales caídos. */
  async lotes(ctx: AuthContext, dateStr?: string) {
    const date = dateOnly(dateStr);
    const ordenes = await this.prisma.ordenBeneficio.findMany({
      where: {
        plantId: ctx.plantId,
        deletedAt: null,
        date,
        eventos: { some: {} },
      },
      orderBy: [{ reference: 'asc' }],
      include: {
        eventos: {
          select: { pesoViscBlancasKg: true, pesoViscRojasKg: true },
        },
      },
    });
    const bases = await this.consecutivoBases(ctx.plantId, [date]);
    return ordenes.map((o) => ({
      ordenBeneficioId: o.id,
      reference: o.reference,
      cliente: o.cliente,
      guias: o.guias,
      date: o.date.toISOString().slice(0, 10),
      consecutivoBase: bases.get(o.id) ?? 0,
      animalCount: o.animalCount,
      caidos: o.eventos.length,
      pesadosBlancas: o.eventos.filter((e) => e.pesoViscBlancasKg != null)
        .length,
      pesadosRojas: o.eventos.filter((e) => e.pesoViscRojasKg != null).length,
    }));
  }

  /** Detalle de un lote con sus animales caídos y su estado de pesaje. */
  async loteDetail(ctx: AuthContext, ordenBeneficioId: string) {
    const o = await this.prisma.ordenBeneficio.findFirst({
      where: { id: ordenBeneficioId, plantId: ctx.plantId, deletedAt: null },
      include: { eventos: { orderBy: { sequence: 'asc' } } },
    });
    if (!o) throw new NotFoundException('Lote no encontrado.');

    const bases = await this.consecutivoBases(ctx.plantId, [o.date]);
    const base = bases.get(o.id) ?? 0;

    const operatorIds = [
      ...new Set(
        o.eventos
          .flatMap((e) => [e.viscBlancasOperatorId, e.viscRojasOperatorId])
          .filter((x): x is string => !!x),
      ),
    ];
    const users = operatorIds.length
      ? await this.prisma.appUser.findMany({
          where: { id: { in: operatorIds } },
          select: { id: true, fullName: true },
        })
      : [];
    const nameById = new Map(users.map((u) => [u.id, u.fullName]));

    return {
      ordenBeneficioId: o.id,
      reference: o.reference,
      cliente: o.cliente,
      guias: o.guias,
      date: o.date.toISOString().slice(0, 10),
      consecutivoBase: base,
      animalCount: o.animalCount,
      caidos: o.eventos.length,
      pesadosBlancas: o.eventos.filter((e) => e.pesoViscBlancasKg != null)
        .length,
      pesadosRojas: o.eventos.filter((e) => e.pesoViscRojasKg != null).length,
      animales: o.eventos.map((e) => ({
        eventoId: e.id,
        sequence: e.sequence,
        consecutivo: base + e.sequence,
        stunnedAt: e.stunnedAt.toISOString(),
        blancas: {
          pesado: e.pesoViscBlancasKg != null,
          pesoKg: e.pesoViscBlancasKg != null ? Number(e.pesoViscBlancasKg) : null,
          at: e.viscBlancasAt?.toISOString() ?? null,
          operatorName: e.viscBlancasOperatorId
            ? (nameById.get(e.viscBlancasOperatorId) ?? '—')
            : null,
        },
        rojas: {
          pesado: e.pesoViscRojasKg != null,
          pesoKg: e.pesoViscRojasKg != null ? Number(e.pesoViscRojasKg) : null,
          at: e.viscRojasAt?.toISOString() ?? null,
          operatorName: e.viscRojasOperatorId
            ? (nameById.get(e.viscRojasOperatorId) ?? '—')
            : null,
        },
      })),
    };
  }

  /** Registra el peso de las vísceras (blancas o rojas) de un animal caído. */
  async registrar(ctx: AuthContext, dto: RegistrarSubproductoDto) {
    const evt = await this.prisma.ordenBeneficioEvento.findFirst({
      where: {
        id: dto.eventoId,
        ordenBeneficio: { plantId: ctx.plantId, deletedAt: null },
      },
      select: {
        id: true,
        pesoViscBlancasKg: true,
        pesoViscRojasKg: true,
      },
    });
    if (!evt) throw new NotFoundException('Animal no encontrado.');

    const yaPesado =
      dto.tipo === 'blancas'
        ? evt.pesoViscBlancasKg != null
        : evt.pesoViscRojasKg != null;
    if (yaPesado) {
      throw new BadRequestException(
        `Las vísceras ${dto.tipo} de este animal ya tienen peso registrado.`,
      );
    }

    const now = new Date();
    const data =
      dto.tipo === 'blancas'
        ? {
            pesoViscBlancasKg: dto.pesoKg,
            viscBlancasAt: now,
            viscBlancasOperatorId: ctx.userId,
          }
        : {
            pesoViscRojasKg: dto.pesoKg,
            viscRojasAt: now,
            viscRojasOperatorId: ctx.userId,
          };

    await this.prisma.ordenBeneficioEvento.update({
      where: { id: evt.id },
      data,
    });
    return { ok: true };
  }
}
