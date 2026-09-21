import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CanalAnimalTipo,
  CanalPiezaTipo,
  CanalTipo,
  OrdenBeneficioStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthContext } from '../../common/auth/auth-context';
import { plantDateOnly } from '../../common/plant-date';
import { RegistrarCanalDto } from './dto/registrar-canal.dto';
import { ClasificarAnimalDto } from './dto/clasificar-animal.dto';
import { ClasificarPiezaDto } from './dto/clasificar-pieza.dto';
import { CAVA_CAPACIDAD } from './cava-capacidad';

function dateOnly(value?: string) {
  return plantDateOnly(value);
}

/** Piezas esperadas por animal según el tipo de canal de la orden. */
function piezasEsperadas(tipo: CanalTipo | null): CanalPiezaTipo[] {
  if (tipo === CanalTipo.canal_completa) return [CanalPiezaTipo.canal];
  if (
    tipo === CanalTipo.media_canal_con_cola ||
    tipo === CanalTipo.media_canal_sin_cola
  ) {
    return [CanalPiezaTipo.cizq, CanalPiezaTipo.cder];
  }
  return [];
}

@Injectable()
export class CanalCalienteService {
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

  /** Órdenes con al menos un animal insensibilizado, listas para pesar en canal. */
  async lotes(ctx: AuthContext, dateStr?: string) {
    const date = dateOnly(dateStr);
    const ordenes = await this.prisma.ordenBeneficio.findMany({
      where: {
        plantId: ctx.plantId,
        deletedAt: null,
        date,
        status: {
          in: [
            OrdenBeneficioStatus.en_insensibilizacion,
            OrdenBeneficioStatus.procesado,
          ],
        },
      },
      orderBy: [{ reference: 'desc' }],
      include: { eventos: { include: { canalPiezas: true } } },
    });
    const bases = await this.consecutivoBases(ctx.plantId, [date]);
    return ordenes.map((o) => {
      let esperadas = 0;
      let pesadas = 0;
      for (const e of o.eventos) {
        esperadas += piezasEsperadas(e.canalTipo).length || 1;
        pesadas += e.canalPiezas.length;
      }
      return {
        ordenBeneficioId: o.id,
        reference: o.reference,
        cliente: o.cliente,
        guias: o.guias,
        date: o.date.toISOString().slice(0, 10),
        consecutivoBase: bases.get(o.id) ?? 0,
        animalCount: o.animalCount,
        piezasEsperadas: esperadas,
        piezasPesadas: pesadas,
      };
    });
  }

  /** Detalle de una orden con sus animales y el estado de sus piezas. */
  async loteDetail(ctx: AuthContext, ordenBeneficioId: string) {
    const o = await this.prisma.ordenBeneficio.findFirst({
      where: { id: ordenBeneficioId, plantId: ctx.plantId, deletedAt: null },
      include: {
        eventos: {
          orderBy: { sequence: 'asc' },
          include: { canalPiezas: true },
        },
      },
    });
    if (!o) throw new NotFoundException('Orden no encontrada.');

    const bases = await this.consecutivoBases(ctx.plantId, [o.date]);
    const base = bases.get(o.id) ?? 0;

    const operatorIds = [
      ...new Set(
        o.eventos.flatMap((e) => e.canalPiezas.map((p) => p.operatorId)),
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
      animales: o.eventos.map((e) => {
        const esperadas = piezasEsperadas(e.canalTipo);
        const byPieza = new Map(e.canalPiezas.map((p) => [p.pieza, p]));
        return {
          eventoId: e.id,
          sequence: e.sequence,
          consecutivo: base + e.sequence,
          stunnedAt: e.stunnedAt.toISOString(),
          canalTipo: e.canalTipo,
          canalAnimalTipo: e.canalAnimalTipo,
          expendio: e.expendio,
          piezas: esperadas.map((pz) => {
            const reg = byPieza.get(pz);
            return {
              pieza: pz,
              pesado: !!reg,
              piezaId: reg?.id ?? null,
              pesoKg: reg ? Number(reg.pesoKg) : null,
              turno: reg?.turno ?? null,
              weighedAt: reg?.weighedAt.toISOString() ?? null,
              operatorName: reg ? (nameById.get(reg.operatorId) ?? '—') : null,
              bodega: reg?.bodega ?? null,
              cava: reg?.cava ?? null,
              destino: reg?.destino ?? null,
              observaciones: reg?.observaciones ?? null,
            };
          }),
        };
      }),
    };
  }

  /** Define el tipo de canal de un animal (puede cambiarse mientras no tenga piezas pesadas). */
  async setTipo(ctx: AuthContext, eventoId: string, tipo: CanalTipo) {
    const evt = await this.prisma.ordenBeneficioEvento.findFirst({
      where: {
        id: eventoId,
        ordenBeneficio: { plantId: ctx.plantId, deletedAt: null },
      },
      select: {
        id: true,
        canalTipo: true,
        ordenBeneficioId: true,
        canalPiezas: { select: { id: true }, take: 1 },
      },
    });
    if (!evt) throw new NotFoundException('Animal no encontrado.');
    if (evt.canalTipo && evt.canalTipo !== tipo && evt.canalPiezas.length) {
      throw new BadRequestException(
        'No se puede cambiar el tipo: este animal ya tiene piezas pesadas.',
      );
    }
    await this.prisma.ordenBeneficioEvento.update({
      where: { id: evt.id },
      data: { canalTipo: tipo },
    });
    return this.loteDetail(ctx, evt.ordenBeneficioId);
  }

  /** Actualiza la clasificación de ESPECIE del animal (vaca, novilla, etc.). */
  async clasificarAnimal(
    ctx: AuthContext,
    eventoId: string,
    dto: ClasificarAnimalDto,
  ) {
    const evt = await this.prisma.ordenBeneficioEvento.findFirst({
      where: {
        id: eventoId,
        ordenBeneficio: { plantId: ctx.plantId, deletedAt: null },
      },
      select: { id: true },
    });
    if (!evt) throw new NotFoundException('Animal no encontrado.');

    await this.prisma.ordenBeneficioEvento.update({
      where: { id: evt.id },
      data: {
        ...(dto.tipo !== undefined && { canalAnimalTipo: dto.tipo }),
        ...(dto.expendio !== undefined && { expendio: dto.expendio }),
      },
    });
    return { ok: true };
  }

  /**
   * Actualiza la clasificación (bodega, cava, destino, observaciones) de una
   * PIEZA pesada (CIZQ, CDER o canal completa): cada mitad puede ir a una
   * bodega/cava distinta.
   */
  async clasificarPieza(
    ctx: AuthContext,
    piezaId: string,
    dto: ClasificarPiezaDto,
  ) {
    const pieza = await this.prisma.canalPieza.findFirst({
      where: {
        id: piezaId,
        evento: { ordenBeneficio: { plantId: ctx.plantId, deletedAt: null } },
      },
      select: { id: true, cava: true },
    });
    if (!pieza) throw new NotFoundException('Pieza no encontrada.');

    // Si se está asignando a una cava distinta a la actual, valida el cupo
    // máximo de canales que admite esa cava antes de dejarla entrar.
    if (dto.cava !== undefined && dto.cava && dto.cava !== pieza.cava) {
      const capacidad = CAVA_CAPACIDAD[dto.cava];
      if (capacidad) {
        const ocupadas = await this.prisma.canalPieza.count({
          where: {
            cava: dto.cava,
            evento: { ordenBeneficio: { plantId: ctx.plantId, deletedAt: null } },
          },
        });
        if (ocupadas >= capacidad.max) {
          throw new BadRequestException(
            `${dto.cava} llegó al máximo de ${capacidad.max} canales. Seleccione otra cava.`,
          );
        }
      }
    }

    await this.prisma.canalPieza.update({
      where: { id: pieza.id },
      data: {
        ...(dto.bodega !== undefined && { bodega: dto.bodega }),
        ...(dto.cava !== undefined && { cava: dto.cava }),
        ...(dto.destino !== undefined && { destino: dto.destino }),
        ...(dto.observaciones !== undefined && {
          observaciones: dto.observaciones,
        }),
      },
    });
    return { ok: true };
  }

  /** Registra el peso de una pieza del canal de un animal. */
  async registrar(ctx: AuthContext, dto: RegistrarCanalDto) {
    const evt = await this.prisma.ordenBeneficioEvento.findFirst({
      where: {
        id: dto.eventoId,
        ordenBeneficio: { plantId: ctx.plantId, deletedAt: null },
      },
      select: {
        id: true,
        canalTipo: true,
      },
    });
    if (!evt) throw new NotFoundException('Animal no encontrado.');
    const tipo = evt.canalTipo;
    if (!tipo) {
      throw new BadRequestException(
        'Primero selecciona el tipo de canal de este animal.',
      );
    }
    if (!piezasEsperadas(tipo).includes(dto.pieza)) {
      throw new BadRequestException(
        'La pieza no corresponde al tipo de canal del animal.',
      );
    }
    const existe = await this.prisma.canalPieza.findUnique({
      where: { eventoId_pieza: { eventoId: evt.id, pieza: dto.pieza } },
      select: { id: true },
    });
    if (existe) {
      throw new BadRequestException('Esta pieza ya tiene peso registrado.');
    }
    await this.prisma.canalPieza.create({
      data: {
        eventoId: evt.id,
        pieza: dto.pieza,
        pesoKg: dto.pesoKg,
        turno: dto.turno ?? null,
        operatorId: ctx.userId,
      },
    });
    return { ok: true };
  }

  /** Deshace el peso de una pieza (corrige un registro erróneo). */
  async deshacer(ctx: AuthContext, piezaId: string) {
    const pieza = await this.prisma.canalPieza.findFirst({
      where: {
        id: piezaId,
        evento: {
          ordenBeneficio: { plantId: ctx.plantId, deletedAt: null },
        },
      },
      select: { id: true },
    });
    if (!pieza) throw new NotFoundException('Pieza no encontrada.');
    await this.prisma.canalPieza.delete({ where: { id: pieza.id } });
    return { ok: true };
  }

  /** ANIMALES: todos los animales de las órdenes con insensibilización iniciada del día. */
  async animales(ctx: AuthContext, dateStr?: string) {
    const date = dateOnly(dateStr);
    const ordenes = await this.prisma.ordenBeneficio.findMany({
      where: {
        plantId: ctx.plantId,
        deletedAt: null,
        date,
        status: {
          in: [
            OrdenBeneficioStatus.en_insensibilizacion,
            OrdenBeneficioStatus.procesado,
          ],
        },
      },
      orderBy: [{ reference: 'asc' }],
      include: {
        eventos: {
          orderBy: { sequence: 'asc' },
          include: { canalPiezas: true },
        },
      },
    });
    const bases = await this.consecutivoBases(ctx.plantId, [date]);
    const rows: {
      eventoId: string;
      consecutivo: number;
      reference: number;
      cliente: string;
      canalTipo: CanalTipo | null;
      canalAnimalTipo: CanalAnimalTipo | null;
      piezasPesadas: number;
      piezasEsperadas: number;
      pesoTotalKg: number;
    }[] = [];
    for (const o of ordenes) {
      const base = bases.get(o.id) ?? 0;
      for (const e of o.eventos) {
        rows.push({
          eventoId: e.id,
          consecutivo: base + e.sequence,
          reference: o.reference,
          cliente: o.cliente,
          canalTipo: e.canalTipo,
          canalAnimalTipo: e.canalAnimalTipo,
          piezasPesadas: e.canalPiezas.length,
          piezasEsperadas: piezasEsperadas(e.canalTipo).length || 1,
          pesoTotalKg: e.canalPiezas.reduce(
            (acc, p) => acc + Number(p.pesoKg),
            0,
          ),
        });
      }
    }
    return rows.sort((a, b) => a.consecutivo - b.consecutivo);
  }

  /** CANALES/CUARTOS: todas las piezas pesadas del día. */
  async piezas(ctx: AuthContext, dateStr?: string) {
    const date = dateOnly(dateStr);
    const piezas = await this.prisma.canalPieza.findMany({
      where: {
        evento: {
          ordenBeneficio: { plantId: ctx.plantId, deletedAt: null, date },
        },
      },
      orderBy: { weighedAt: 'desc' },
      include: {
        evento: {
          include: {
            ordenBeneficio: {
              select: { id: true, reference: true, cliente: true },
            },
          },
        },
      },
    });
    const bases = await this.consecutivoBases(ctx.plantId, [date]);
    const operatorIds = [...new Set(piezas.map((p) => p.operatorId))];
    const users = operatorIds.length
      ? await this.prisma.appUser.findMany({
          where: { id: { in: operatorIds } },
          select: { id: true, fullName: true },
        })
      : [];
    const nameById = new Map(users.map((u) => [u.id, u.fullName]));
    return piezas.map((p) => ({
      piezaId: p.id,
      reference: p.evento.ordenBeneficio.reference,
      cliente: p.evento.ordenBeneficio.cliente,
      consecutivo:
        (bases.get(p.evento.ordenBeneficio.id) ?? 0) + p.evento.sequence,
      pieza: p.pieza,
      pesoKg: Number(p.pesoKg),
      turno: p.turno,
      weighedAt: p.weighedAt.toISOString(),
      operatorName: nameById.get(p.operatorId) ?? '—',
    }));
  }

  /** REPORTE: totales del día por cliente y global. */
  async reporte(ctx: AuthContext, dateStr?: string) {
    const piezas = await this.piezas(ctx, dateStr);
    const porCliente = new Map<
      string,
      {
        cliente: string;
        piezas: number;
        pesoKg: number;
        animales: Set<number>;
      }
    >();
    for (const p of piezas) {
      const cur = porCliente.get(p.cliente) ?? {
        cliente: p.cliente,
        piezas: 0,
        pesoKg: 0,
        animales: new Set<number>(),
      };
      cur.piezas += 1;
      cur.pesoKg += p.pesoKg;
      cur.animales.add(p.consecutivo);
      porCliente.set(p.cliente, cur);
    }
    const clientes = [...porCliente.values()].map((c) => ({
      cliente: c.cliente,
      animales: c.animales.size,
      piezas: c.piezas,
      pesoKg: Number(c.pesoKg.toFixed(2)),
    }));
    return {
      clientes: clientes.sort((a, b) => a.cliente.localeCompare(b.cliente)),
      totalPiezas: piezas.length,
      totalPesoKg: Number(
        piezas.reduce((acc, p) => acc + p.pesoKg, 0).toFixed(2),
      ),
    };
  }
}
