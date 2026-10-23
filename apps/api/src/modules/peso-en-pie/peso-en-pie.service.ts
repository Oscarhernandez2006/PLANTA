import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  PesoCamion,
  PesoCamionStatus,
  PesoEnPie,
  PesoEnPieStatus,
  PesoEnPieTipoPesaje,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthContext } from '../../common/auth/auth-context';
import { SavePesoEnPieDto } from './dto/save-peso-en-pie.dto';
import { PromediarGuiaDto } from './dto/promediar-guia.dto';
import { plantToday } from '../../common/plant-date';

function dateOnly(s?: string) {
  const str = s ?? plantToday();
  return { str, date: new Date(`${str}T00:00:00.000Z`) };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

type AnimalConRepesajes = Prisma.PesoEnPieGetPayload<{
  include: { repesajes: true };
}>;

/** Pesos de un animal: inicial (antes del 1.er repesaje), actual y merma total. */
function pesosAnimal(a: AnimalConRepesajes) {
  const actual = Number(a.pesoTotalKg ?? 0);
  const primera = [...a.repesajes].sort((x, y) => x.ronda - y.ronda)[0];
  const inicial = primera ? Number(primera.pesoAnteriorKg) : actual;
  return { inicial, actual, merma: round2(inicial - actual) };
}

function mermaPct(inicial: number, merma: number) {
  return inicial > 0 ? round2((merma / inicial) * 100) : 0;
}

@Injectable()
export class PesoEnPieService {
  constructor(private readonly prisma: PrismaService) {}

  private toDto(r: PesoEnPie) {
    return {
      id: r.id,
      reference: r.reference,
      bpReference: r.bpReference,
      bcReference: r.bcReference,
      date: r.date.toISOString().slice(0, 10),
      guia: r.guia,
      procedencia: r.procedencia,
      proveedor: r.proveedor,
      cliente: r.cliente,
      placa: r.placa,
      conductor: r.conductor,
      corral: r.corral,
      tipoAnimal: r.tipoAnimal,
      lote: r.lote,
      animalNo: r.animalNo,
      animalCount: r.animalCount,
      tipoPesaje: r.tipoPesaje,
      pesoTotalKg: r.pesoTotalKg == null ? null : Number(r.pesoTotalKg),
      pesoPromedioKg:
        r.pesoPromedioKg == null ? null : Number(r.pesoPromedioKg),
      cantidad: r.cantidad,
      entrada: r.entrada == null ? null : Number(r.entrada),
      salida: r.salida == null ? null : Number(r.salida),
      observaciones: r.observaciones,
      status: r.status,
    };
  }

  /** Próxima referencia (orden de llegada) del día para la planta. */
  async nextReference(ctx: AuthContext, dateStr?: string) {
    const { date } = dateOnly(dateStr);
    const agg = await this.prisma.pesoEnPie.aggregate({
      _max: { reference: true },
      where: { plantId: ctx.plantId, date, deletedAt: null },
    });
    return { next: (agg._max.reference ?? 0) + 1 };
  }

  /**
   * Vista previa del BP de una guía y del consecutivo del próximo animal
   * (1, 2…), con la misma regla que `create`, para que el operario pueda
   * marcar el animal antes de pesarlo. Si la guía es nueva, el BP es una
   * estimación que se confirma al guardar el primer animal.
   */
  async bpPreview(ctx: AuthContext, bcReference?: number, guia?: string) {
    const existing = await this.prisma.pesoEnPie.findFirst({
      where: {
        plantId: ctx.plantId,
        deletedAt: null,
        ...(bcReference != null ? { bcReference } : { guia: guia?.trim() }),
      },
      orderBy: { reference: 'desc' },
      select: { bpReference: true, reference: true },
    });
    if (existing) {
      return {
        bpReference: existing.bpReference,
        nextAnimal: existing.reference + 1,
        existing: true,
      };
    }

    const agg = await this.prisma.pesoEnPie.aggregate({
      _max: { bpReference: true },
      where: { plantId: ctx.plantId, deletedAt: null },
    });
    return {
      bpReference: (agg._max.bpReference ?? 0) + 1,
      nextAnimal: 1,
      existing: false,
    };
  }

  private fields(dto: SavePesoEnPieDto) {
    const tipoPesaje = dto.tipoPesaje ?? PesoEnPieTipoPesaje.promediado;
    const total = dto.pesoTotalKg ?? null;
    // Si no envían promedio pero sí total y cantidad, se calcula.
    let promedio = dto.pesoPromedioKg ?? null;
    if (promedio == null && total != null && dto.animalCount > 0) {
      promedio = Number((total / dto.animalCount).toFixed(2));
    }
    return {
      guia: dto.guia?.trim() || null,
      procedencia: dto.procedencia?.trim() || null,
      proveedor: dto.proveedor?.trim() || null,
      cliente: dto.cliente?.trim() || null,
      placa: dto.placa?.trim() || null,
      conductor: dto.conductor?.trim() || null,
      corral: dto.corral?.trim() || null,
      tipoAnimal: dto.tipoAnimal?.trim() || null,
      lote: dto.lote?.trim() || null,
      animalNo: dto.animalNo?.trim() || null,
      animalCount: dto.animalCount,
      tipoPesaje,
      pesoTotalKg: total,
      pesoPromedioKg: promedio,
      cantidad: dto.cantidad ?? null,
      entrada: dto.entrada ?? null,
      salida: dto.salida ?? null,
      observaciones: dto.observaciones?.trim() || null,
    };
  }

  async create(ctx: AuthContext, dto: SavePesoEnPieDto) {
    const { date } = dateOnly(dto.date);
    return this.prisma.$transaction(async (tx) => {
      if (dto.guia?.trim()) {
        const closedGuide = await tx.pesoEnPie.findFirst({
          where: {
            plantId: ctx.plantId,
            date,
            guia: dto.guia.trim(),
            status: PesoEnPieStatus.en_insensibilizacion,
            deletedAt: null,
          },
          select: { id: true },
        });
        if (closedGuide) {
          throw new BadRequestException('El proceso de esta guía ya está cerrado.');
        }
      }
      // Serializa la numeración de BP por planta.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${ctx.plantId}:pep`}))`;
      await this.assertNoSuperaNeto(tx, ctx, {
        date,
        guia: dto.guia,
        bcReference: dto.bcReference,
        pesoKg: dto.pesoTotalKg ?? 0,
      });

      // Un BP por guía (asociado a la BC). Reusa el BP existente de la guía o
      // asigna el próximo consecutivo global; los animales se numeran dentro del BP.
      const guiaKey = dto.guia?.trim() || null;
      const previo = await tx.pesoEnPie.findFirst({
        where: {
          plantId: ctx.plantId,
          deletedAt: null,
          ...(dto.bcReference != null
            ? { bcReference: dto.bcReference }
            : { guia: guiaKey }),
        },
        orderBy: { reference: 'desc' },
        select: { bpReference: true, reference: true },
      });

      let bpReference: number;
      let reference: number;
      if (previo) {
        bpReference = previo.bpReference;
        reference = previo.reference + 1;
      } else {
        const agg = await tx.pesoEnPie.aggregate({
          _max: { bpReference: true },
          where: { plantId: ctx.plantId, deletedAt: null },
        });
        bpReference = (agg._max.bpReference ?? 0) + 1;
        reference = 1;
      }

      const rec = await tx.pesoEnPie.create({
        data: {
          plantId: ctx.plantId,
          reference,
          bpReference,
          bcReference: dto.bcReference ?? null,
          date,
          createdById: ctx.userId,
          ...this.fields(dto),
        },
      });
      return this.toDto(rec);
    });
  }

  /**
   * Pesaje promediado: registra de una vez todos los animales que le faltan a
   * la guía, cada uno con el mismo peso = (neto báscula camión − ya pesado en
   * pie) ÷ animales pendientes. Si la guía aún no tiene animales, es el neto
   * dividido por la cantidad de animales. El peso se trunca a 2 decimales para
   * que el total nunca supere el neto.
   */
  async registrarPromediado(ctx: AuthContext, dto: PromediarGuiaDto) {
    const camion = await this.prisma.pesoCamion.findFirst({
      where: { id: dto.pesoCamionId, plantId: ctx.plantId, deletedAt: null },
    });
    if (!camion) throw new NotFoundException('Guía no encontrada.');
    if (camion.pieStatus !== PesoCamionStatus.abierta) {
      throw new BadRequestException('La guía ya está cerrada en Peso en Pie.');
    }
    const guia = camion.guia?.trim();
    if (!guia) throw new BadRequestException('La guía no tiene número.');
    const neto = camion.netoKg == null ? null : Number(camion.netoKg);
    if (neto == null || neto <= 0) {
      throw new BadRequestException('La guía no tiene peso neto de báscula camión.');
    }
    if (camion.salida == null || Number(camion.salida) <= 0) {
      throw new BadRequestException(
        'La guía no tiene peso de salida en báscula camión; regístralo antes de promediar.',
      );
    }
    const cantidad = camion.cantidad ?? 0;
    if (cantidad <= 0) {
      throw new BadRequestException('La guía no tiene cantidad de animales.');
    }

    return this.prisma.$transaction(async (tx) => {
      // Mismo candado que `create`: serializa la numeración de BP y animales.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${ctx.plantId}:pep`}))`;
      const guiaWhere = { plantId: ctx.plantId, date: camion.date, guia, deletedAt: null };
      const cerrada = await tx.pesoEnPie.findFirst({
        where: { ...guiaWhere, status: PesoEnPieStatus.en_insensibilizacion },
        select: { id: true },
      });
      if (cerrada) throw new BadRequestException('El proceso de esta guía ya está cerrado.');

      const agg = await tx.pesoEnPie.aggregate({
        _sum: { pesoTotalKg: true, animalCount: true },
        where: guiaWhere,
      });
      const registrados = agg._sum.animalCount ?? 0;
      const pendientes = cantidad - registrados;
      if (pendientes <= 0) {
        throw new BadRequestException(`Esta guía ya tiene registrados sus ${cantidad} animales.`);
      }
      const disponible = round2(neto - Number(agg._sum.pesoTotalKg ?? 0));
      const pesoKg = Math.floor((disponible / pendientes) * 100) / 100;
      if (pesoKg <= 0) {
        throw new BadRequestException(
          `No queda peso disponible del neto de báscula camión (${neto.toFixed(2)} kg) para los ${pendientes} animales pendientes.`,
        );
      }

      const previo = await tx.pesoEnPie.findFirst({
        where: { plantId: ctx.plantId, deletedAt: null, bcReference: camion.reference },
        orderBy: { reference: 'desc' },
        select: { bpReference: true, reference: true },
      });
      let bpReference: number;
      let reference: number;
      if (previo) {
        bpReference = previo.bpReference;
        reference = previo.reference;
      } else {
        const maxBp = await tx.pesoEnPie.aggregate({
          _max: { bpReference: true },
          where: { plantId: ctx.plantId, deletedAt: null },
        });
        bpReference = (maxBp._max.bpReference ?? 0) + 1;
        reference = 0;
      }

      const base = this.fields({
        bcReference: camion.reference,
        guia,
        procedencia: camion.procedencia ?? undefined,
        proveedor: camion.proveedor ?? undefined,
        cliente: camion.cliente ?? undefined,
        placa: camion.placa ?? undefined,
        conductor: camion.conductor ?? undefined,
        cantidad,
        entrada: camion.entrada == null ? undefined : Number(camion.entrada),
        salida: camion.salida == null ? undefined : Number(camion.salida),
        corral: dto.corral,
        tipoAnimal: dto.tipoAnimal,
        animalCount: 1,
        tipoPesaje: PesoEnPieTipoPesaje.promediado,
        pesoTotalKg: pesoKg,
        pesoPromedioKg: pesoKg,
      });
      const creados = [];
      for (let i = 1; i <= pendientes; i++) {
        creados.push(
          await tx.pesoEnPie.create({
            data: {
              plantId: ctx.plantId,
              reference: reference + i,
              bpReference,
              bcReference: camion.reference,
              date: camion.date,
              createdById: ctx.userId,
              ...base,
            },
          }),
        );
      }
      return {
        creados: creados.length,
        pesoKg,
        netoKg: neto,
        bpReference,
        desde: reference + 1,
        hasta: reference + pendientes,
      };
    });
  }

  async update(ctx: AuthContext, id: string, dto: SavePesoEnPieDto) {
    const existing = await this.prisma.pesoEnPie.findFirst({
      where: { id, plantId: ctx.plantId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Reporte no encontrado.');
    await this.assertNoSuperaNeto(this.prisma, ctx, {
      date: existing.date,
      guia: dto.guia ?? existing.guia,
      bcReference: existing.bcReference ?? undefined,
      pesoKg: dto.pesoTotalKg ?? 0,
      excludeId: id,
    });

    const rec = await this.prisma.pesoEnPie.update({
      where: { id },
      data: this.fields(dto),
    });
    return this.toDto(rec);
  }

  /** El total en pie de la guía no puede superar el neto pesado en báscula camión. */
  private async assertNoSuperaNeto(
    db: Prisma.TransactionClient,
    ctx: AuthContext,
    p: { date: Date; guia?: string | null; bcReference?: number; pesoKg: number; excludeId?: string },
  ) {
    const guia = p.guia?.trim();
    if (!guia && p.bcReference == null) return;
    const camion = await db.pesoCamion.findFirst({
      where: {
        plantId: ctx.plantId,
        deletedAt: null,
        ...(p.bcReference != null ? { reference: p.bcReference } : { date: p.date, guia }),
      },
      select: { netoKg: true },
    });
    if (camion?.netoKg == null) return;
    const neto = Number(camion.netoKg);

    const agg = await db.pesoEnPie.aggregate({
      _sum: { pesoTotalKg: true },
      where: {
        plantId: ctx.plantId,
        date: p.date,
        guia,
        deletedAt: null,
        ...(p.excludeId ? { id: { not: p.excludeId } } : {}),
      },
    });
    const total = Number(agg._sum.pesoTotalKg ?? 0) + p.pesoKg;
    if (total > neto + 1e-6) {
      throw new BadRequestException(
        `El total en pie (${total.toFixed(2)} kg) superaría el neto de báscula camión (${neto.toFixed(2)} kg). Disponible: ${Math.max(neto - (total - p.pesoKg), 0).toFixed(2)} kg.`,
      );
    }
  }

  /**
   * Borra un animal registrado por error. Solo mientras la guía sigue abierta
   * en Peso en Pie (animal pendiente). Se borra en firme para que su número
   * (A0n) pueda volver a usarse sin chocar con la restricción única
   * (planta, BP, referencia); los demás animales conservan su número.
   */
  async remove(ctx: AuthContext, id: string) {
    const existing = await this.prisma.pesoEnPie.findFirst({
      where: { id, plantId: ctx.plantId, deletedAt: null },
      include: {
        insensibilizacion: { select: { id: true } },
        _count: { select: { repesajes: true } },
      },
    });
    if (!existing) throw new NotFoundException('Animal no encontrado.');
    if (
      existing.status !== PesoEnPieStatus.pendiente ||
      existing.insensibilizacion ||
      existing._count.repesajes > 0
    ) {
      throw new BadRequestException(
        'La guía de este animal ya se cerró en Peso en Pie; no se puede borrar.',
      );
    }
    await this.prisma.pesoEnPie.delete({ where: { id } });
    return { id, bpReference: existing.bpReference, reference: existing.reference };
  }

  async findAll(ctx: AuthContext, status?: PesoEnPieStatus) {
    const rows = await this.prisma.pesoEnPie.findMany({
      where: {
        plantId: ctx.plantId,
        deletedAt: null,
        ...(status ? { status } : {}),
      },
      orderBy: [{ date: 'desc' }, { reference: 'desc' }],
      take: 1000,
    });
    return rows.map((r) => this.toDto(r));
  }

  async closeGuide(ctx: AuthContext, dateStr: string, guia: string) {
    const { date } = dateOnly(dateStr);
    const normalizedGuia = guia.trim();
    if (!normalizedGuia) throw new NotFoundException('Guía no encontrada.');

    const result = await this.prisma.pesoEnPie.updateMany({
      where: {
        plantId: ctx.plantId,
        date,
        guia: normalizedGuia,
        deletedAt: null,
        status: PesoEnPieStatus.pendiente,
      },
      data: { status: PesoEnPieStatus.en_insensibilizacion },
    });

    if (!result.count) {
      throw new NotFoundException('No hay animales pendientes para cerrar.');
    }

    return { closed: result.count };
  }

  async findOne(ctx: AuthContext, id: string) {
    const rec = await this.prisma.pesoEnPie.findFirst({
      where: { id, plantId: ctx.plantId, deletedAt: null },
    });
    if (!rec) throw new NotFoundException('Reporte no encontrado.');
    return this.toDto(rec);
  }

  // ===================== Guías cerradas y repesaje =====================

  /** Resumen de una guía cerrada: pesos inicial/actual, merma y estado del repesaje. */
  private resumenGuia(
    c: PesoCamion,
    animales: AnimalConRepesajes[],
    sacrificados: number,
  ) {
    const pesos = animales.map(pesosAnimal);
    const pesoInicialKg = round2(pesos.reduce((s, p) => s + p.inicial, 0));
    const pesoActualKg = round2(pesos.reduce((s, p) => s + p.actual, 0));
    const mermaKg = round2(pesoInicialKg - pesoActualKg);
    const motivoBloqueo =
      sacrificados > 0 ? 'Ya hay animales de esta guía en Sacrificio.' : null;
    return {
      id: c.id,
      bcReference: c.reference,
      referenciaLote: c.referenciaLote,
      bpReference: animales[0]?.bpReference ?? null,
      date: c.date.toISOString().slice(0, 10),
      guia: c.guia,
      procedencia: c.procedencia,
      proveedor: c.proveedor,
      cliente: c.cliente,
      placa: c.placa,
      conductor: c.conductor,
      cantidad: c.cantidad,
      entrada: c.entrada == null ? null : Number(c.entrada),
      salida: c.salida == null ? null : Number(c.salida),
      neto: c.netoKg == null ? null : Number(c.netoKg),
      animales: animales.length,
      pesoInicialKg,
      pesoActualKg,
      mermaKg,
      mermaPct: mermaPct(pesoInicialKg, mermaKg),
      repesajeRonda: c.repesajeRonda,
      repesajeAbierto: c.repesajeAbierto,
      repesadosRonda: c.repesajeAbierto
        ? animales.filter((a) =>
            a.repesajes.some((r) => r.ronda === c.repesajeRonda),
          ).length
        : 0,
      puedeRepesar: !motivoBloqueo,
      motivoBloqueo,
    };
  }

  private animalesDeGuiaWhere(ctx: AuthContext, c: PesoCamion) {
    const guia = c.guia?.trim();
    if (!guia) throw new BadRequestException('La guía no tiene número.');
    return {
      guia,
      where: {
        plantId: ctx.plantId,
        date: c.date,
        guia,
        deletedAt: null,
      } satisfies Prisma.PesoEnPieWhereInput,
    };
  }

  /** Guías ya cerradas en Peso en Pie, con su merma y estado de repesaje. */
  async guiasCerradas(ctx: AuthContext) {
    const camiones = await this.prisma.pesoCamion.findMany({
      where: {
        plantId: ctx.plantId,
        deletedAt: null,
        pieStatus: PesoCamionStatus.cerrada,
        guia: { not: null },
      },
      orderBy: [{ date: 'desc' }, { reference: 'desc' }],
      take: 200,
    });
    if (!camiones.length) return [];

    const guias = [...new Set(camiones.map((c) => c.guia!.trim()))];
    const fechas = [...new Set(camiones.map((c) => c.date.getTime()))].map(
      (t) => new Date(t),
    );
    const [animales, ordenes] = await Promise.all([
      this.prisma.pesoEnPie.findMany({
        where: {
          plantId: ctx.plantId,
          deletedAt: null,
          guia: { in: guias },
          date: { in: fechas },
        },
        include: { repesajes: true },
        orderBy: { reference: 'asc' },
      }),
      this.prisma.ordenBeneficio.findMany({
        where: {
          plantId: ctx.plantId,
          deletedAt: null,
          date: { in: fechas },
          guias: { hasSome: guias },
        },
        select: { date: true, guias: true, _count: { select: { eventos: true } } },
      }),
    ]);

    const key = (d: Date, g: string) => `${d.toISOString().slice(0, 10)}|${g.trim()}`;
    const animalesPorGuia = new Map<string, AnimalConRepesajes[]>();
    for (const a of animales) {
      if (!a.guia) continue;
      const k = key(a.date, a.guia);
      animalesPorGuia.set(k, [...(animalesPorGuia.get(k) ?? []), a]);
    }
    const sacrificadosPorGuia = new Map<string, number>();
    for (const o of ordenes) {
      for (const g of o.guias) {
        const k = key(o.date, g);
        sacrificadosPorGuia.set(k, (sacrificadosPorGuia.get(k) ?? 0) + o._count.eventos);
      }
    }

    return camiones
      .map((c) => {
        const k = key(c.date, c.guia!);
        return this.resumenGuia(
          c,
          animalesPorGuia.get(k) ?? [],
          sacrificadosPorGuia.get(k) ?? 0,
        );
      })
      .filter((g) => g.animales > 0);
  }

  /** Detalle por animal de una guía cerrada (pesos, merma e historial de repesajes). */
  async guiaCerradaDetalle(ctx: AuthContext, id: string) {
    const c = await this.prisma.pesoCamion.findFirst({
      where: { id, plantId: ctx.plantId, deletedAt: null },
    });
    if (!c || c.pieStatus !== PesoCamionStatus.cerrada) {
      throw new NotFoundException('Guía cerrada no encontrada.');
    }
    const { guia, where } = this.animalesDeGuiaWhere(ctx, c);
    const [animales, sacrificados] = await Promise.all([
      this.prisma.pesoEnPie.findMany({
        where,
        include: { repesajes: true },
        orderBy: { reference: 'asc' },
      }),
      this.prisma.ordenBeneficioEvento.count({
        where: {
          ordenBeneficio: {
            plantId: ctx.plantId,
            deletedAt: null,
            date: c.date,
            guias: { has: guia },
          },
        },
      }),
    ]);

    const enRonda = (a: AnimalConRepesajes) =>
      c.repesajeAbierto && a.repesajes.some((r) => r.ronda === c.repesajeRonda);
    const siguiente = c.repesajeAbierto
      ? animales.find((a) => !enRonda(a))
      : undefined;

    return {
      ...this.resumenGuia(c, animales, sacrificados),
      siguienteId: siguiente?.id ?? null,
      items: animales.map((a) => {
        const p = pesosAnimal(a);
        return {
          id: a.id,
          reference: a.reference,
          bpReference: a.bpReference,
          tipoAnimal: a.tipoAnimal,
          corral: a.corral,
          observaciones: a.observaciones,
          pesoInicialKg: p.inicial,
          pesoActualKg: p.actual,
          mermaKg: p.merma,
          mermaPct: mermaPct(p.inicial, p.merma),
          repesadoEnRonda: enRonda(a),
          historial: [...a.repesajes]
            .sort((x, y) => x.ronda - y.ronda)
            .map((r) => ({
              ronda: r.ronda,
              pesoAnteriorKg: Number(r.pesoAnteriorKg),
              pesoNuevoKg: Number(r.pesoNuevoKg),
              mermaKg: Number(r.mermaKg),
              createdAt: r.createdAt.toISOString(),
            })),
        };
      }),
    };
  }

  /**
   * Abre una nueva ronda de repesaje de una guía cerrada. Solo se permite si
   * ningún animal de la guía entró a Sacrificio (el peso repesado es el que
   * cuenta para el beneficio).
   */
  async iniciarRepesaje(ctx: AuthContext, id: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`repesaje:${id}`}))`;
      const c = await tx.pesoCamion.findFirst({
        where: { id, plantId: ctx.plantId, deletedAt: null },
      });
      if (!c) throw new NotFoundException('Guía no encontrada.');
      if (c.pieStatus !== PesoCamionStatus.cerrada) {
        throw new BadRequestException(
          'La guía debe estar cerrada en Peso en Pie para repesarla.',
        );
      }
      if (c.repesajeAbierto) {
        throw new BadRequestException('Ya hay un repesaje en curso para esta guía.');
      }
      const { guia, where } = this.animalesDeGuiaWhere(ctx, c);
      if (!(await tx.pesoEnPie.count({ where }))) {
        throw new BadRequestException('La guía no tiene animales pesados.');
      }

      // Mismo candado que usa Sacrificio por orden: así no puede caer un
      // animal mientras se abre el repesaje (ni al revés).
      const ordenes = await tx.ordenBeneficio.findMany({
        where: { plantId: ctx.plantId, deletedAt: null, date: c.date, guias: { has: guia } },
        select: { id: true },
        orderBy: { id: 'asc' },
      });
      for (const o of ordenes) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ins:${o.id}`}))`;
      }
      const sacrificados = ordenes.length
        ? await tx.ordenBeneficioEvento.count({
            where: { ordenBeneficioId: { in: ordenes.map((o) => o.id) } },
          })
        : 0;
      if (sacrificados) {
        throw new BadRequestException(
          'No se puede repesar: ya hay animales de esta guía en Sacrificio.',
        );
      }

      await tx.pesoCamion.update({
        where: { id },
        data: { repesajeAbierto: true, repesajeRonda: { increment: 1 } },
      });
    });
    return this.guiaCerradaDetalle(ctx, id);
  }

  /**
   * Termina la ronda en curso. Si aún no se repesó ningún animal, la ronda se
   * descarta; si no, los animales sin repesar conservan su peso anterior.
   */
  async finalizarRepesaje(ctx: AuthContext, id: string) {
    const cancelado = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`repesaje:${id}`}))`;
      const c = await tx.pesoCamion.findFirst({
        where: { id, plantId: ctx.plantId, deletedAt: null },
      });
      if (!c) throw new NotFoundException('Guía no encontrada.');
      if (!c.repesajeAbierto) {
        throw new BadRequestException('La guía no tiene un repesaje en curso.');
      }
      const { where } = this.animalesDeGuiaWhere(ctx, c);
      const repesados = await tx.pesoEnPieRepesaje.count({
        where: { ronda: c.repesajeRonda, pesoEnPie: where },
      });
      await tx.pesoCamion.update({
        where: { id },
        data: repesados
          ? { repesajeAbierto: false }
          : { repesajeAbierto: false, repesajeRonda: { decrement: 1 } },
      });
      return repesados === 0;
    });
    return { ...(await this.guiaCerradaDetalle(ctx, id)), cancelado };
  }

  /**
   * Registra el repesaje de un animal en la ronda en curso. Los animales se
   * repesan en el mismo orden en que se pesaron (1, 2…). Guarda el peso
   * anterior, el nuevo y la merma, y deja el nuevo peso como el vigente.
   */
  async repesarAnimal(ctx: AuthContext, pesoEnPieId: string, pesoKg: number) {
    const animal = await this.prisma.pesoEnPie.findFirst({
      where: { id: pesoEnPieId, plantId: ctx.plantId, deletedAt: null },
      select: { date: true, guia: true },
    });
    if (!animal) throw new NotFoundException('Animal no encontrado.');
    const guiaAnimal = animal.guia?.trim();
    const camionRef = guiaAnimal
      ? await this.prisma.pesoCamion.findFirst({
          where: {
            plantId: ctx.plantId,
            deletedAt: null,
            date: animal.date,
            guia: guiaAnimal,
          },
          select: { id: true },
        })
      : null;
    if (!camionRef) throw new BadRequestException('No se encontró la guía del animal.');

    const repesado = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`repesaje:${camionRef.id}`}))`;
      const c = await tx.pesoCamion.findUniqueOrThrow({ where: { id: camionRef.id } });
      if (!c.repesajeAbierto) {
        throw new BadRequestException('La guía no tiene un repesaje en curso.');
      }
      const { where } = this.animalesDeGuiaWhere(ctx, c);
      const animales = await tx.pesoEnPie.findMany({
        where,
        orderBy: { reference: 'asc' },
        include: { repesajes: { where: { ronda: c.repesajeRonda } } },
      });
      const pendientes = animales.filter((a) => !a.repesajes.length);
      const siguiente = pendientes[0];
      if (!siguiente) {
        throw new BadRequestException('Todos los animales de la guía ya fueron repesados.');
      }
      if (siguiente.id !== pesoEnPieId) {
        throw new BadRequestException(
          `Los animales se repesan en orden: sigue el animal ${siguiente.reference}.`,
        );
      }

      const anterior = Number(siguiente.pesoTotalKg ?? 0);
      const nuevo = round2(pesoKg);
      const merma = round2(anterior - nuevo);
      await tx.pesoEnPieRepesaje.create({
        data: {
          plantId: ctx.plantId,
          pesoEnPieId: siguiente.id,
          ronda: c.repesajeRonda,
          pesoAnteriorKg: anterior,
          pesoNuevoKg: nuevo,
          mermaKg: merma,
          operatorId: ctx.userId,
        },
      });
      await tx.pesoEnPie.update({
        where: { id: siguiente.id },
        data: {
          pesoTotalKg: nuevo,
          pesoPromedioKg:
            siguiente.animalCount > 0 ? round2(nuevo / siguiente.animalCount) : nuevo,
        },
      });
      const finalizado = pendientes.length === 1;
      if (finalizado) {
        await tx.pesoCamion.update({
          where: { id: c.id },
          data: { repesajeAbierto: false },
        });
      }
      return {
        reference: siguiente.reference,
        pesoAnteriorKg: anterior,
        pesoNuevoKg: nuevo,
        mermaKg: merma,
        finalizado,
      };
    });
    return { repesado, guia: await this.guiaCerradaDetalle(ctx, camionRef.id) };
  }
}
