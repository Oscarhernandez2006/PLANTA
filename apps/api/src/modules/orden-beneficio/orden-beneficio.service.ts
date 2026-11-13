import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OrdenBeneficio,
  OrdenBeneficioStatus,
  PesoCamionStatus,
  SubproductoDestino,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthContext } from '../../common/auth/auth-context';
import { CreateOrdenBeneficioDto, DividirOrdenBeneficioDto } from './dto/create-orden-beneficio.dto';
import {
  RegistrarRetiroDto,
  SetSubproductoDestinoDto,
} from './dto/subproducto-destino.dto';
import { plantToday } from '../../common/plant-date';

function dateOnly(s?: string) {
  const str = s ?? plantToday();
  return { str, date: new Date(`${str}T00:00:00.000Z`) };
}

/** Animal de Peso en Pie disponible (sin orden) para armar lotes. */
export interface AnimalDisponible {
  id: string;
  reference: number;
  tipoAnimal: string | null;
  corral: string | null;
  pesoKg: number | null;
}

export interface GuiaDetalle {
  guia: string;
  corrales: string[];
  animalesEnPie: number;
  asignados: number;
  disponibles: number;
  pcReference: number | null;
  bpReference: number | null;
  animales: AnimalDisponible[];
}

export interface Candidate {
  cliente: string;
  guiasDetalle: GuiaDetalle[];
  totalDisponibles: number;
}

@Injectable()
export class OrdenBeneficioService {
  constructor(private readonly prisma: PrismaService) {}

  private toDto(r: OrdenBeneficio, insensibilizados = 0) {
    return {
      id: r.id,
      reference: r.reference,
      date: r.date.toISOString().slice(0, 10),
      cliente: r.cliente,
      guias: r.guias,
      animalCount: r.animalCount,
      observaciones: r.observaciones,
      status: r.status,
      insensibilizados,
      subproductoDestino: r.subproductoDestino,
      subproductoRetiroAt: r.subproductoRetiroAt?.toISOString() ?? null,
      subproductoRetiroObservaciones: r.subproductoRetiroObservaciones,
      cabezasPatas: r.cabezasPatas,
      pcReference: r.pcReference,
      bpReference: r.bpReference,
    };
  }

  /**
   * Reúne los datos del día: guías por cliente (Peso en Camión), animales
   * validados por guía (Peso en Pie) y animales ya asignados a lotes por guía
   * (Órdenes de Beneficio existentes).
   */
  private async aggregate(ctx: AuthContext, date: Date) {
    const [camiones, pesosEnPie, ordenes] = await Promise.all([
      this.prisma.pesoCamion.findMany({
        // La guía se cierra en Peso en Pie; solo las cerradas allí son candidatas.
        where: {
          plantId: ctx.plantId,
          date,
          deletedAt: null,
          pieStatus: PesoCamionStatus.cerrada,
        },
        select: { cliente: true, guia: true, reference: true },
      }),
      this.prisma.pesoEnPie.findMany({
        where: {
          plantId: ctx.plantId,
          date,
          deletedAt: null,
        },
        select: {
          id: true,
          guia: true,
          animalCount: true,
          corral: true,
          bpReference: true,
          reference: true,
          tipoAnimal: true,
          pesoTotalKg: true,
          ordenBeneficioId: true,
        },
        orderBy: { reference: 'asc' },
      }),
      this.prisma.ordenBeneficio.findMany({
        where: { plantId: ctx.plantId, date, deletedAt: null },
        select: { guias: true, animalCount: true },
      }),
    ]);

    // Animales de Peso en Pie por guía.
    const enPiePorGuia = new Map<string, number>();
    const corralesPorGuia = new Map<string, Set<string>>();
    const bpReferenciaPorGuia = new Map<string, number>();
    const animalesLibresPorGuia = new Map<string, AnimalDisponible[]>();
    for (const p of pesosEnPie) {
      const g = p.guia?.trim();
      if (!g) continue;
      enPiePorGuia.set(g, (enPiePorGuia.get(g) ?? 0) + p.animalCount);
      if (!p.ordenBeneficioId) {
        const libres = animalesLibresPorGuia.get(g) ?? [];
        libres.push({
          id: p.id,
          reference: p.reference,
          tipoAnimal: p.tipoAnimal?.trim() || null,
          corral: p.corral?.trim() || null,
          pesoKg: p.pesoTotalKg == null ? null : Number(p.pesoTotalKg),
        });
        animalesLibresPorGuia.set(g, libres);
      }
      const corral = p.corral?.trim();
      if (corral) {
        const set = corralesPorGuia.get(g) ?? new Set<string>();
        set.add(corral);
        corralesPorGuia.set(g, set);
      }
      if (!bpReferenciaPorGuia.has(g)) {
        bpReferenciaPorGuia.set(g, p.bpReference);
      }
    }

    // Animales ya asignados a lotes por guía.
    const asignadoPorGuia = new Map<string, number>();
    for (const o of ordenes) {
      for (const g of o.guias) {
        const key = g.trim();
        if (!key) continue;
        asignadoPorGuia.set(key, (asignadoPorGuia.get(key) ?? 0) + o.animalCount);
      }
    }

    // Guías de Peso en Camión agrupadas por cliente.
    const porCliente = new Map<string, Set<string>>();
    const pcReferenciaPorGuia = new Map<string, number>();
    for (const c of camiones) {
      const cliente = c.cliente?.trim();
      const g = c.guia?.trim();
      if (!cliente || !g) continue;
      const set = porCliente.get(cliente) ?? new Set<string>();
      set.add(g);
      porCliente.set(cliente, set);
      if (!pcReferenciaPorGuia.has(g)) {
        pcReferenciaPorGuia.set(g, c.reference);
      }
    }

    return {
      porCliente,
      enPiePorGuia,
      asignadoPorGuia,
      corralesPorGuia,
      pcReferenciaPorGuia,
      bpReferenciaPorGuia,
      animalesLibresPorGuia,
    };
  }

  /** Clientes del día con sus guías y animales disponibles por guía. */
  async candidates(ctx: AuthContext, dateStr?: string): Promise<Candidate[]> {
    const { date } = dateOnly(dateStr);
    const {
      porCliente,
      enPiePorGuia,
      asignadoPorGuia,
      corralesPorGuia,
      pcReferenciaPorGuia,
      bpReferenciaPorGuia,
      animalesLibresPorGuia,
    } = await this.aggregate(ctx, date);

    const list: Candidate[] = [];
    for (const [cliente, guias] of porCliente) {
      const guiasDetalle: GuiaDetalle[] = [...guias]
        .filter((guia) => enPiePorGuia.has(guia))
        .sort()
        .map((guia) => {
          const animalesEnPie = enPiePorGuia.get(guia) ?? 0;
          const asignados = asignadoPorGuia.get(guia) ?? 0;
          const corrales = [...(corralesPorGuia.get(guia) ?? [])].sort();
          return {
            guia,
            corrales,
            animalesEnPie,
            asignados,
            disponibles: Math.max(0, animalesEnPie - asignados),
            pcReference: pcReferenciaPorGuia.get(guia) ?? null,
            bpReference: bpReferenciaPorGuia.get(guia) ?? null,
            animales: animalesLibresPorGuia.get(guia) ?? [],
          };
        })
        // Oculta las guías cuyos animales ya se asignaron todos a lotes.
        .filter((g) => g.disponibles > 0);
      if (!guiasDetalle.length) continue;
      const totalDisponibles = guiasDetalle.reduce(
        (sum, g) => sum + g.disponibles,
        0,
      );
      list.push({ cliente, guiasDetalle, totalDisponibles });
    }
    list.sort((a, b) => a.cliente.localeCompare(b.cliente));
    return list;
  }

  /** Próximo consecutivo de referencia para la planta en la fecha dada. */
  async nextReference(ctx: AuthContext, dateStr?: string) {
    const { date } = dateOnly(dateStr);
    const agg = await this.prisma.ordenBeneficio.aggregate({
      _max: { reference: true },
      where: { plantId: ctx.plantId, date, deletedAt: null },
    });
    return { next: (agg._max.reference ?? 0) + 1 };
  }

  /** Crea un lote de beneficio con una parte (o el total) de una guía. */
  async create(ctx: AuthContext, dto: CreateOrdenBeneficioDto) {
    if (dto.animalCount != null && dto.animalCount < 1) {
      throw new BadRequestException('La cantidad debe ser mayor a cero.');
    }
    const [orden] = await this.crearOrdenes(ctx, dto, {
      animalIds: dto.animalIds?.length ? [dto.animalIds] : null,
      cantidades: dto.animalCount != null ? [dto.animalCount] : null,
    });
    return orden;
  }

  /**
   * Divide los animales disponibles de una guía en varias órdenes
   * consecutivas (OB n, n+1…) indicando qué animales van en cada una. Deben
   * repartirse todos los disponibles; se crean todas o ninguna.
   */
  async dividir(ctx: AuthContext, dto: DividirOrdenBeneficioDto) {
    if (dto.animales.some((ids) => !ids.length)) {
      throw new BadRequestException('Cada orden debe tener al menos un animal.');
    }
    return this.crearOrdenes(ctx, dto, { animalIds: dto.animales, cantidades: null, exacta: true });
  }

  /**
   * Crea una o varias órdenes de la misma guía en una sola transacción y
   * deja cada animal de Peso en Pie amarrado a su orden (`ordenBeneficioId`
   * + `ordenSequence`).
   *
   * - `animalIds`: animales explícitos por orden (elegidos por el operario).
   * - `cantidades`: solo cantidades; se toman los disponibles en orden de pesaje.
   * - Ninguno: una orden con todos los disponibles.
   * Con `exacta`, deben quedar repartidos todos los disponibles de la guía.
   */
  private async crearOrdenes(
    ctx: AuthContext,
    dto: Omit<CreateOrdenBeneficioDto, 'animalCount' | 'animalIds'>,
    opts: { animalIds: string[][] | null; cantidades: number[] | null; exacta?: boolean },
  ) {
    const { str, date } = dateOnly(dto.date);
    const cliente = dto.cliente.trim();
    const guia = dto.guia.trim();
    if (!cliente) throw new BadRequestException('Cliente requerido.');
    if (!guia) throw new BadRequestException('Guía requerida.');

    return this.prisma.$transaction(async (tx) => {
      // Serializa la creación de lotes por planta y día (referencia y cupos).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${ctx.plantId}:${str}:ob`}))`;

      // La guía debe pertenecer al cliente en Peso en Camión.
      const camion = await tx.pesoCamion.findFirst({
        where: { plantId: ctx.plantId, date, cliente, guia, deletedAt: null },
        select: { id: true, reference: true },
      });
      if (!camion) {
        throw new BadRequestException(
          'La guía no corresponde al cliente en Peso en Camión.',
        );
      }

      // Animales validados en Peso en Pie para la guía, en orden de pesaje.
      const animalesPie = await tx.pesoEnPie.findMany({
        where: { plantId: ctx.plantId, date, guia, deletedAt: null },
        select: { id: true, reference: true, bpReference: true, ordenBeneficioId: true },
        orderBy: { reference: 'asc' },
      });
      if (!animalesPie.length) {
        throw new BadRequestException(
          'La guía no tiene animales validados en Peso en Pie.',
        );
      }
      const libres = animalesPie.filter((a) => !a.ordenBeneficioId);
      const disponibles = libres.length;
      if (disponibles <= 0) {
        throw new BadRequestException(
          'La guía ya tiene todos sus animales asignados a lotes.',
        );
      }

      // Resuelve qué animales van en cada orden.
      let grupos: string[][];
      if (opts.animalIds) {
        const libresSet = new Set(libres.map((a) => a.id));
        const vistos = new Set<string>();
        for (const ids of opts.animalIds) {
          for (const id of ids) {
            if (!libresSet.has(id)) {
              throw new BadRequestException(
                'Uno de los animales seleccionados no está disponible en esta guía (ya tiene orden o no existe).',
              );
            }
            if (vistos.has(id)) {
              throw new BadRequestException('Un animal no puede ir en dos órdenes.');
            }
            vistos.add(id);
          }
        }
        grupos = opts.animalIds;
      } else {
        const lista = opts.cantidades ?? [disponibles];
        let i = 0;
        grupos = lista.map((n) => libres.slice(i, (i += n)).map((a) => a.id));
      }
      const total = grupos.reduce((s, g) => s + g.length, 0);
      if (opts.exacta && total !== disponibles) {
        throw new BadRequestException(
          `Debes repartir exactamente los ${disponibles} animales disponibles de la guía ${guia} (repartiste ${total}).`,
        );
      }
      if (total > disponibles) {
        throw new BadRequestException(
          `Solo quedan ${disponibles} animales disponibles en la guía ${guia}.`,
        );
      }

      const agg = await tx.ordenBeneficio.aggregate({
        _max: { reference: true },
        where: { plantId: ctx.plantId, date, deletedAt: null },
      });
      const primera = (agg._max.reference ?? 0) + 1;
      const refPie = new Map(animalesPie.map((a) => [a.id, a.reference]));

      const creadas: OrdenBeneficio[] = [];
      for (const [i, ids] of grupos.entries()) {
        const orden = await tx.ordenBeneficio.create({
          data: {
            plantId: ctx.plantId,
            reference: primera + i,
            date,
            cliente,
            guias: [guia],
            animalCount: ids.length,
            observaciones: dto.observaciones?.trim() || null,
            status: dto.status ?? OrdenBeneficioStatus.activo,
            subproductoDestino: dto.subproductoDestino ?? SubproductoDestino.empresa,
            cabezasPatas: dto.cabezasPatas ?? false,
            createdById: ctx.userId,
            pcReference: camion.reference,
            bpReference: animalesPie[0]?.bpReference ?? null,
          },
        });
        // Numeración dentro de la orden (1, 2…) siguiendo el orden de pesaje,
        // que es el que ve el operario en Sacrificio.
        const ordenados = [...ids].sort((a, b) => (refPie.get(a) ?? 0) - (refPie.get(b) ?? 0));
        for (const [j, id] of ordenados.entries()) {
          await tx.pesoEnPie.update({
            where: { id },
            data: { ordenBeneficioId: orden.id, ordenSequence: j + 1 },
          });
        }
        creadas.push(orden);
      }
      return creadas.map((r) => this.toDto(r));
    });
  }

  async findAll(
    ctx: AuthContext,
    opts: { date?: string; from?: string; to?: string } = {},
  ) {
    const where = { plantId: ctx.plantId, deletedAt: null } as {
      plantId: string;
      deletedAt: null;
      date?: Date | { gte: Date; lte: Date };
    };
    if (opts.from && opts.to) {
      where.date = {
        gte: dateOnly(opts.from).date,
        lte: dateOnly(opts.to).date,
      };
    } else if (opts.date) {
      where.date = dateOnly(opts.date).date;
    }

    const rows = await this.prisma.ordenBeneficio.findMany({
      where,
      orderBy: [{ date: 'desc' }, { reference: 'desc' }],
      include: { _count: { select: { eventos: true } } },
      take: 1000,
    });
    return rows.map((r) => this.toDto(r, r._count.eventos));
  }

  async findOne(ctx: AuthContext, id: string) {
    const rec = await this.prisma.ordenBeneficio.findFirst({
      where: { id, plantId: ctx.plantId, deletedAt: null },
      include: {
        _count: { select: { eventos: true } },
        animales: {
          where: { deletedAt: null },
          orderBy: { ordenSequence: 'asc' },
          select: {
            id: true,
            reference: true,
            ordenSequence: true,
            tipoAnimal: true,
            corral: true,
            pesoTotalKg: true,
          },
        },
      },
    });
    if (!rec) throw new NotFoundException('Orden de Beneficio no encontrada.');
    return {
      ...this.toDto(rec, rec._count.eventos),
      // Animales asignados explícitamente (órdenes creadas antes de esta
      // funcionalidad no tienen lista: se resuelven por posición).
      animales: rec.animales.map((a) => ({
        id: a.id,
        sequence: a.ordenSequence ?? 0,
        reference: a.reference,
        tipoAnimal: a.tipoAnimal?.trim() || null,
        corral: a.corral?.trim() || null,
        pesoKg: a.pesoTotalKg == null ? null : Number(a.pesoTotalKg),
      })),
    };
  }

  /** Define quién se queda con las vísceras del lote (empresa o firmante). */
  async setSubproductoDestino(
    ctx: AuthContext,
    id: string,
    dto: SetSubproductoDestinoDto,
  ) {
    const rec = await this.prisma.ordenBeneficio.findFirst({
      where: { id, plantId: ctx.plantId, deletedAt: null },
    });
    if (!rec) throw new NotFoundException('Orden de Beneficio no encontrada.');

    // Si se cambia de "firmante" a "empresa" (o viceversa) se limpia la
    // constancia de retiro previa: ya no aplica al nuevo destino.
    const updated = await this.prisma.ordenBeneficio.update({
      where: { id },
      data: {
        subproductoDestino: dto.subproductoDestino,
        subproductoRetiroAt: null,
        subproductoRetiroById: null,
        subproductoRetiroObservaciones: null,
      },
    });
    return this.toDto(updated);
  }

  /** Deja constancia de que el firmante retiró las vísceras del lote. */
  async registrarRetiro(ctx: AuthContext, id: string, dto: RegistrarRetiroDto) {
    const rec = await this.prisma.ordenBeneficio.findFirst({
      where: { id, plantId: ctx.plantId, deletedAt: null },
    });
    if (!rec) throw new NotFoundException('Orden de Beneficio no encontrada.');
    if (rec.subproductoDestino !== SubproductoDestino.firmante) {
      throw new BadRequestException(
        'Este lote tiene sus vísceras a nombre de la empresa; no aplica retiro.',
      );
    }

    const updated = await this.prisma.ordenBeneficio.update({
      where: { id },
      data: {
        subproductoRetiroAt: new Date(),
        subproductoRetiroById: ctx.userId,
        subproductoRetiroObservaciones: dto.observaciones?.trim() || null,
      },
    });
    return this.toDto(updated);
  }

  async remove(ctx: AuthContext, id: string) {
    const rec = await this.prisma.ordenBeneficio.findFirst({
      where: { id, plantId: ctx.plantId, deletedAt: null },
    });
    if (!rec) throw new NotFoundException('Orden de Beneficio no encontrada.');
    if (rec.status !== OrdenBeneficioStatus.activo) {
      throw new BadRequestException(
        'Solo se puede eliminar una orden pendiente (sin insensibilización).',
      );
    }
    // Borrado físico: al ser pendiente no tiene eventos y así libera su
    // referencia para que el próximo lote reinicie la numeración del día.
    await this.prisma.$transaction([
      // Libera los animales para que puedan ir a otro lote.
      this.prisma.pesoEnPie.updateMany({
        where: { ordenBeneficioId: id },
        data: { ordenBeneficioId: null, ordenSequence: null },
      }),
      this.prisma.ordenBeneficio.delete({ where: { id } }),
    ]);
    return { ok: true };
  }
}
