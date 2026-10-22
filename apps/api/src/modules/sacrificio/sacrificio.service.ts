import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrdenBeneficioStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthContext } from '../../common/auth/auth-context';
import { plantToday } from '../../common/plant-date';
import { itemsParaAnimal } from '../subproductos/subproducto-items';

/** Días hacia atrás que se pueden consultar con el filtro de fecha. */
const DIAS_FILTRO = 30;

@Injectable()
export class SacrificioService {
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

  /** NIT del catálogo Cliente para cada nombre de cliente (por concepto). */
  private async nitsPorCliente(clientes: string[]) {
    const nombres = [...new Set(clientes)];
    const rows = nombres.length
      ? await this.prisma.cliente.findMany({
          where: { concepto: { in: nombres } },
          select: { concepto: true, nit: true },
        })
      : [];
    return new Map(rows.map((r) => [r.concepto, r.nit]));
  }

  /**
   * Sin fecha: órdenes activas (de cualquier día) y las completadas de hoy.
   * Con fecha (solo los últimos 30 días): activas y completadas de ese día.
   */
  async pendientes(ctx: AuthContext, dateStr?: string) {
    const hoyStr = plantToday();
    const hoy = new Date(`${hoyStr}T00:00:00.000Z`);
    let dia: Date | null = null;
    if (dateStr) {
      dia = new Date(`${dateStr}T00:00:00.000Z`);
      const desde = new Date(hoy.getTime() - DIAS_FILTRO * 86_400_000);
      if (Number.isNaN(dia.getTime()) || dia > hoy || dia < desde) {
        throw new BadRequestException(
          `Solo se pueden consultar los últimos ${DIAS_FILTRO} días.`,
        );
      }
    }
    const rows = await this.prisma.ordenBeneficio.findMany({
      where: {
        plantId: ctx.plantId,
        deletedAt: null,
        ...(dia
          ? {
              date: dia,
              status: { in: [OrdenBeneficioStatus.activo, OrdenBeneficioStatus.procesado] },
            }
          : {
              OR: [
                { status: OrdenBeneficioStatus.activo },
                { status: OrdenBeneficioStatus.procesado, date: hoy },
              ],
            }),
      },
      orderBy: [{ date: 'asc' }, { reference: 'asc' }],
      include: { _count: { select: { eventos: true } } },
      take: 1000,
    });
    const bases = await this.consecutivoBases(
      ctx.plantId,
      [...new Set(rows.map((r) => r.date.getTime()))].map((t) => new Date(t)),
    );
    const nits = await this.nitsPorCliente(rows.map((r) => r.cliente));
    return rows.map((r) => ({
      id: r.id,
      reference: r.reference,
      date: r.date.toISOString().slice(0, 10),
      cliente: r.cliente,
      clienteNit: nits.get(r.cliente) ?? null,
      guias: r.guias,
      animalCount: r.animalCount,
      consecutivoBase: bases.get(r.id) ?? 0,
      status: r.status,
      insensibilizados: r._count.eventos,
      cabezasPatas: r.cabezasPatas,
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
    const nits = await this.nitsPorCliente([ob.cliente]);

    return {
      id: ob.id,
      reference: ob.reference,
      date: ob.date.toISOString().slice(0, 10),
      cliente: ob.cliente,
      clienteNit: nits.get(ob.cliente) ?? null,
      guias: ob.guias,
      animalCount: ob.animalCount,
      consecutivoBase: bases.get(ob.id) ?? 0,
      status: ob.status,
      insensibilizados: ob.eventos.length,
      cabezasPatas: ob.cabezasPatas,
      eventos: ob.eventos.map((e) => ({
        sequence: e.sequence,
        stunnedAt: e.stunnedAt.toISOString(),
        operatorId: e.operatorId,
        operatorName: nameById.get(e.operatorId) ?? '—',
      })),
    };
  }

  /**
   * Marca un animal de la orden como sacrificado. Se puede tumbar en cualquier
   * orden: `sequence` es el número del animal dentro de la orden (1, 2…) y queda como
   * identidad del animal en Pieles, Subproductos, Canal Caliente, etc. El
   * operario escoge siempre el animal (`sequence`).
   */
  async stunNext(ctx: AuthContext, ordenBeneficioId: string, sequenceElegida: number) {
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

      // El peso que cuenta para el beneficio es el repesado: no se sacrifica
      // mientras alguna guía del lote esté en repesaje en Peso en Pie.
      const enRepesaje = await tx.pesoCamion.findFirst({
        where: {
          plantId: ctx.plantId,
          deletedAt: null,
          date: ob.date,
          guia: { in: ob.guias },
          repesajeAbierto: true,
        },
        select: { guia: true },
      });
      if (enRepesaje) {
        throw new BadRequestException(
          `La guía ${enRepesaje.guia} está en repesaje en Peso en Pie. Termina el repesaje antes de sacrificar.`,
        );
      }

      const existentes = await tx.ordenBeneficioEvento.findMany({
        where: { ordenBeneficioId },
        select: { sequence: true },
      });
      const count = existentes.length;
      if (count >= ob.animalCount) {
        throw new BadRequestException(
          'Todos los animales de la orden ya están sacrificados.',
        );
      }

      const tomados = new Set(existentes.map((e) => e.sequence));
      if (sequenceElegida > ob.animalCount) {
        throw new BadRequestException(
          `La orden solo tiene ${ob.animalCount} animales.`,
        );
      }
      if (tomados.has(sequenceElegida)) {
        const base = (await this.consecutivoBases(ctx.plantId, [ob.date])).get(ob.id) ?? 0;
        throw new BadRequestException(
          `El animal ${base + sequenceElegida} ya fue sacrificado.`,
        );
      }
      const sequence = sequenceElegida;
      const evento = await tx.ordenBeneficioEvento.create({
        data: { ordenBeneficioId, sequence, operatorId: ctx.userId },
      });

      // Al caer el animal se genera de una vez su checklist de subproductos
      // (y cabeza/patas si el lote lo pidió al crearse).
      await tx.subproductoItem.createMany({
        data: itemsParaAnimal().map((item) => ({
          eventoId: evento.id,
          tipo: item.tipo,
        })),
      });

      // La orden se queda "activa" mientras se sacrifican animales; solo
      // pasa a "procesado" cuando cae el último (no hay estado intermedio).
      if (count + 1 >= ob.animalCount) {
        await tx.ordenBeneficio.update({
          where: { id: ob.id },
          data: { status: OrdenBeneficioStatus.procesado },
        });
      }
    });
    return this.findOne(ctx, ordenBeneficioId);
  }

  /**
   * Devuelve un animal tumbado (el indicado por `sequence`, o el último por
   * hora) para corregir un toque erróneo: vuelve a quedar pendiente. Requiere
   * el PIN de inicio de sesión de quien lo tumbó, y que el animal aún no
   * tenga datos registrados después (canales, piel o subproductos).
   */
  async undo(ctx: AuthContext, ordenBeneficioId: string, pin: string, sequence?: number) {
    await this.prisma.$transaction(async (tx) => {
      const ob = await tx.ordenBeneficio.findFirst({
        where: { id: ordenBeneficioId, plantId: ctx.plantId, deletedAt: null },
      });
      if (!ob) throw new NotFoundException('Orden de Beneficio no encontrada.');

      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ins:${ordenBeneficioId}`}))`;

      const last = await tx.ordenBeneficioEvento.findFirst({
        where: { ordenBeneficioId, ...(sequence != null ? { sequence } : {}) },
        orderBy: [{ stunnedAt: 'desc' }, { createdAt: 'desc' }],
        include: {
          _count: { select: { canalPiezas: true } },
          subproductos: {
            where: {
              OR: [{ marcado: true }, { pesoKg: { not: null } }, { registradoAt: { not: null } }],
            },
            select: { id: true },
            take: 1,
          },
        },
      });
      // Turno del día del animal, para los mensajes.
      const base = (await this.consecutivoBases(ctx.plantId, [ob.date])).get(ob.id) ?? 0;
      if (!last) {
        throw new BadRequestException(
          sequence != null
            ? `El animal ${base + sequence} no está sacrificado.`
            : 'No hay registros para deshacer.',
        );
      }
      const animal = String(base + last.sequence);

      // Devolverlo borraría lo ya registrado de ese animal en otros módulos.
      const registrado = [
        last._count.canalPiezas > 0 && 'canales pesadas en Canal Caliente',
        last.pesoPielKg != null && 'la piel pesada',
        last.subproductos.length > 0 && 'subproductos registrados',
      ].filter(Boolean);
      if (registrado.length) {
        throw new BadRequestException(
          `El animal ${animal} ya tiene ${registrado.join(', ')}; no se puede devolver.`,
        );
      }

      // Error 400 (no 401) para que un PIN mal digitado no cierre la sesión.
      const operario = await tx.appUser.findUnique({
        where: { id: last.operatorId },
        select: { fullName: true, pinHash: true, active: true },
      });
      const pinOk =
        !!operario?.active &&
        !!operario.pinHash &&
        (await bcrypt.compare(pin, operario.pinHash));
      if (!pinOk) {
        throw new BadRequestException(
          `PIN incorrecto. Solo ${operario?.fullName ?? 'quien lo tumbó'}, que tumbó el animal ${animal}, puede devolverlo.`,
        );
      }

      await tx.ordenBeneficioEvento.delete({ where: { id: last.id } });
      // Sin estado intermedio: mientras no se completen todos los animales
      // la orden vuelve/se queda en "activo".
      await tx.ordenBeneficio.update({
        where: { id: ob.id },
        data: { status: OrdenBeneficioStatus.activo },
      });
    });
    return this.findOne(ctx, ordenBeneficioId);
  }
}
