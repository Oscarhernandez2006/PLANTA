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

  /** Órdenes activas y las ya completadas del día (quedan visibles como completadas). */
  async pendientes(ctx: AuthContext) {
    const hoy = new Date(`${plantToday()}T00:00:00.000Z`);
    const rows = await this.prisma.ordenBeneficio.findMany({
      where: {
        plantId: ctx.plantId,
        deletedAt: null,
        OR: [
          { status: OrdenBeneficioStatus.activo },
          { status: OrdenBeneficioStatus.procesado, date: hoy },
        ],
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
   * orden: `sequence` es el número de la tarjeta tocada (A05 = 5) y queda como
   * identidad del animal en Pieles, Subproductos, Canal Caliente, etc. Sin
   * `sequence` se toma el primer animal pendiente.
   */
  async stunNext(ctx: AuthContext, ordenBeneficioId: string, sequenceElegida?: number) {
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
      let sequence: number;
      if (sequenceElegida != null) {
        if (sequenceElegida > ob.animalCount) {
          throw new BadRequestException(
            `La orden solo tiene ${ob.animalCount} animales.`,
          );
        }
        if (tomados.has(sequenceElegida)) {
          throw new BadRequestException(
            `El animal A${String(sequenceElegida).padStart(2, '0')} ya fue sacrificado.`,
          );
        }
        sequence = sequenceElegida;
      } else {
        sequence = 1;
        while (tomados.has(sequence)) sequence++;
      }
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
   * Deshace el último animal tumbado (por hora), para corregir un toque
   * erróneo. Requiere el PIN de inicio de sesión de quien tumbó ese animal.
   */
  async undoLast(ctx: AuthContext, ordenBeneficioId: string, pin: string) {
    await this.prisma.$transaction(async (tx) => {
      const ob = await tx.ordenBeneficio.findFirst({
        where: { id: ordenBeneficioId, plantId: ctx.plantId, deletedAt: null },
      });
      if (!ob) throw new NotFoundException('Orden de Beneficio no encontrada.');

      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ins:${ordenBeneficioId}`}))`;

      const last = await tx.ordenBeneficioEvento.findFirst({
        where: { ordenBeneficioId },
        orderBy: [{ stunnedAt: 'desc' }, { createdAt: 'desc' }],
      });
      if (!last) {
        throw new BadRequestException('No hay registros para deshacer.');
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
        const animal = `A${String(last.sequence).padStart(2, '0')}`;
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
