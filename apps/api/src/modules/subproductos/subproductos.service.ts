import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthContext } from '../../common/auth/auth-context';
import { RegistrarSubproductoDto } from './dto/registrar-subproducto.dto';
import { plantDateOnly } from '../../common/plant-date';
import { SUBPRODUCTO_ITEM_BY_TIPO } from './subproducto-items';

function dateOnly(value?: string) {
  return plantDateOnly(value);
}

// Cantidad de ítems del checklist que corresponden a cada grupo de vísceras.
const TOTAL_POR_GRUPO = {
  rojas: [...SUBPRODUCTO_ITEM_BY_TIPO.values()].filter(
    (i) => i.grupo === 'rojas',
  ).length,
  blancas: [...SUBPRODUCTO_ITEM_BY_TIPO.values()].filter(
    (i) => i.grupo === 'blancas',
  ).length,
};

@Injectable()
export class SubproductosService {
  constructor(private readonly prisma: PrismaService) {}

  private contarPorGrupo(subproductos: { tipo: string; marcado: boolean }[]) {
    let blancas = 0;
    let rojas = 0;
    for (const s of subproductos) {
      if (!s.marcado) continue;
      const def = SUBPRODUCTO_ITEM_BY_TIPO.get(s.tipo as never);
      if (def?.grupo === 'blancas') blancas += 1;
      else if (def?.grupo === 'rojas') rojas += 1;
    }
    return { blancas, rojas };
  }

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
          select: { subproductos: { select: { tipo: true, marcado: true } } },
        },
      },
    });
    const bases = await this.consecutivoBases(ctx.plantId, [date]);
    return ordenes.map((o) => {
      let pesadosBlancas = 0;
      let pesadosRojas = 0;
      for (const e of o.eventos) {
        const { blancas, rojas } = this.contarPorGrupo(e.subproductos);
        pesadosBlancas += blancas;
        pesadosRojas += rojas;
      }
      return {
        ordenBeneficioId: o.id,
        reference: o.reference,
        cliente: o.cliente,
        guias: o.guias,
        date: o.date.toISOString().slice(0, 10),
        consecutivoBase: bases.get(o.id) ?? 0,
        animalCount: o.animalCount,
        caidos: o.eventos.length,
        pesadosBlancas,
        pesadosRojas,
        totalBlancas: o.eventos.length * TOTAL_POR_GRUPO.blancas,
        totalRojas: o.eventos.length * TOTAL_POR_GRUPO.rojas,
        subproductoDestino: o.subproductoDestino,
        subproductoRetiroAt: o.subproductoRetiroAt?.toISOString() ?? null,
      };
    });
  }

  /** Detalle de un lote con sus animales caídos y su estado de pesaje. */
  async loteDetail(ctx: AuthContext, ordenBeneficioId: string) {
    const o = await this.prisma.ordenBeneficio.findFirst({
      where: { id: ordenBeneficioId, plantId: ctx.plantId, deletedAt: null },
      include: {
        eventos: {
          orderBy: { sequence: 'asc' },
          include: { subproductos: true },
        },
      },
    });
    if (!o) throw new NotFoundException('Lote no encontrado.');

    const bases = await this.consecutivoBases(ctx.plantId, [o.date]);
    const base = bases.get(o.id) ?? 0;

    const operatorIds = [
      ...new Set(
        o.eventos
          .flatMap((e) => e.subproductos.map((s) => s.operatorId))
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

    let pesadosBlancas = 0;
    let pesadosRojas = 0;
    for (const e of o.eventos) {
      const { blancas, rojas } = this.contarPorGrupo(e.subproductos);
      pesadosBlancas += blancas;
      pesadosRojas += rojas;
    }

    return {
      ordenBeneficioId: o.id,
      reference: o.reference,
      cliente: o.cliente,
      guias: o.guias,
      date: o.date.toISOString().slice(0, 10),
      consecutivoBase: base,
      animalCount: o.animalCount,
      caidos: o.eventos.length,
      pesadosBlancas,
      pesadosRojas,
      totalBlancas: o.eventos.length * TOTAL_POR_GRUPO.blancas,
      totalRojas: o.eventos.length * TOTAL_POR_GRUPO.rojas,
      subproductoDestino: o.subproductoDestino,
      subproductoRetiroAt: o.subproductoRetiroAt?.toISOString() ?? null,
      subproductoRetiroObservaciones: o.subproductoRetiroObservaciones,
      animales: o.eventos.map((e) => ({
        eventoId: e.id,
        sequence: e.sequence,
        consecutivo: base + e.sequence,
        stunnedAt: e.stunnedAt.toISOString(),
        items: [...e.subproductos]
          .sort((a, b) => a.tipo.localeCompare(b.tipo))
          .map((s) => {
            const def = SUBPRODUCTO_ITEM_BY_TIPO.get(s.tipo);
            return {
              tipo: s.tipo,
              label: def?.label ?? s.tipo,
              grupo: def?.grupo ?? 'blancas',
              unidad: def?.unidad ?? 'unidad',
              marcado: s.marcado,
              pesoKg: s.pesoKg != null ? Number(s.pesoKg) : null,
              registradoAt: s.registradoAt?.toISOString() ?? null,
              operatorName: s.operatorId
                ? (nameById.get(s.operatorId) ?? '—')
                : null,
            };
          }),
      })),
    };
  }

  /** Marca (o registra el peso de) un ítem del checklist de un animal caído. */
  async registrar(ctx: AuthContext, dto: RegistrarSubproductoDto) {
    const item = await this.prisma.subproductoItem.findFirst({
      where: {
        eventoId: dto.eventoId,
        tipo: dto.tipo,
        evento: { ordenBeneficio: { plantId: ctx.plantId, deletedAt: null } },
      },
    });
    if (!item) throw new NotFoundException('Ítem no encontrado.');
    if (item.marcado) {
      throw new BadRequestException('Este ítem ya fue registrado.');
    }

    const def = SUBPRODUCTO_ITEM_BY_TIPO.get(item.tipo);
    if (def?.unidad === 'kg' && dto.pesoKg == null) {
      throw new BadRequestException(`${def.label} requiere peso en kg.`);
    }

    await this.prisma.subproductoItem.update({
      where: { id: item.id },
      data: {
        marcado: true,
        pesoKg: def?.unidad === 'kg' ? dto.pesoKg : null,
        registradoAt: new Date(),
        operatorId: ctx.userId,
      },
    });
    return { ok: true };
  }
}
