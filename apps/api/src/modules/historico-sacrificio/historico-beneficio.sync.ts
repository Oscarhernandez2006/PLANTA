import { Injectable, Logger } from '@nestjs/common';
import { CanalAnimalTipo } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { piezasEsperadas } from '../canal-caliente/piezas-esperadas';

/**
 * Nombre comparable para buscar la tarifa: sin tildes, puntos ni la razón
 * social (SAS, S.A.S.), para que "AGROPECUARIA SANTACRUZ SAS" encuentre la
 * tarifa "AGROPECUARIA SANTACRUZ".
 */
export function nombreTarifa(s: string) {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[.,]/g, ' ')
    .replace(/\bS\s*A\s*S\b|\bSAS\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const COLUMNA: Record<CanalAnimalTipo, 'novillo' | 'novilla' | 'vaca' | 'toro' | 'bufalo'> = {
  novillo: 'novillo',
  novilla: 'novilla',
  vaca: 'vaca',
  toro: 'toro',
  bufalo: 'bufalo',
  bufala: 'bufalo',
};

/**
 * Lleva cada orden de beneficio terminada en Canal Caliente al Histórico
 * Sacrificio (hoja BENEFICIO): una fila por orden, con lote = número de la OB.
 */
@Injectable()
export class HistoricoBeneficioSync {
  private readonly log = new Logger(HistoricoBeneficioSync.name);

  constructor(private readonly prisma: PrismaService) {}

  async tarifaDe(plantId: string, firmador?: string | null) {
    const nombre = firmador ? nombreTarifa(firmador) : '';
    if (!nombre) return 0;
    const tarifas = await this.prisma.historicoTarifa.findMany({ where: { plantId } });
    const t = tarifas.find((x) => nombreTarifa(x.cliente) === nombre);
    return t ? Number(t.valorBase) : 0;
  }

  /** Igual que `sincronizarOrden`, pero sin interrumpir la operación que la llama si algo falla. */
  async sincronizarSeguro(plantId: string, ordenBeneficioId: string) {
    try {
      await this.sincronizarOrden(plantId, ordenBeneficioId);
    } catch (e) {
      this.log.error(`No se pudo pasar la orden ${ordenBeneficioId} al histórico: ${(e as Error).message}`);
    }
  }

  /** Atajo cuando solo se conoce el animal (evento) que cambió. */
  async sincronizarPorEvento(plantId: string, eventoId: string) {
    const evt = await this.prisma.ordenBeneficioEvento.findUnique({
      where: { id: eventoId },
      select: { ordenBeneficioId: true },
    });
    if (evt) await this.sincronizarSeguro(plantId, evt.ordenBeneficioId);
  }

  /**
   * Crea/actualiza la fila de la orden si TODOS sus animales tienen las piezas
   * de canal pesadas; si la orden dejó de estar completa (se deshizo una
   * pieza), quita la fila que se había generado.
   */
  async sincronizarOrden(plantId: string, ordenBeneficioId: string) {
    const orden = await this.prisma.ordenBeneficio.findFirst({
      where: { id: ordenBeneficioId, plantId },
      include: { eventos: { include: { canalPiezas: true }, orderBy: { sequence: 'asc' } } },
    });
    const completa =
      !!orden &&
      !orden.deletedAt &&
      orden.eventos.length > 0 &&
      orden.eventos.length >= orden.animalCount &&
      orden.eventos.every((e) => {
        const req = piezasEsperadas(e.canalTipo);
        return req.length > 0 && req.every((pz) => e.canalPiezas.some((p) => p.pieza === pz));
      });
    if (!orden || !completa) {
      await this.prisma.historicoBeneficio.deleteMany({ where: { ordenBeneficioId } });
      return null;
    }

    const guias = orden.guias.map((g) => g.trim()).filter(Boolean);
    const camiones = await this.prisma.pesoCamion.findMany({
      where: { plantId, deletedAt: null, guia: { in: guias } },
      orderBy: { reference: 'asc' },
    });

    // Peso en pie: el animal N de la orden es el (desfase + N) de su guía,
    // igual que en los informes (una guía puede repartirse en varias órdenes).
    let pesoPie = 0;
    if (guias.length === 1) {
      const [previas, animales] = await Promise.all([
        this.prisma.ordenBeneficio.aggregate({
          _sum: { animalCount: true },
          where: {
            plantId,
            deletedAt: null,
            date: orden.date,
            guias: { has: guias[0] },
            reference: { lt: orden.reference },
          },
        }),
        this.prisma.pesoEnPie.findMany({
          where: { plantId, deletedAt: null, date: orden.date, guia: guias[0] },
          select: { reference: true, pesoTotalKg: true },
        }),
      ]);
      const desfase = previas._sum.animalCount ?? 0;
      const porRef = new Map(animales.map((a) => [a.reference, Number(a.pesoTotalKg ?? 0)]));
      for (const e of orden.eventos) pesoPie += porRef.get(desfase + e.sequence) ?? 0;
    } else if (guias.length > 1) {
      const agg = await this.prisma.pesoEnPie.aggregate({
        _sum: { pesoTotalKg: true },
        where: { plantId, deletedAt: null, date: orden.date, guia: { in: guias } },
      });
      pesoPie = Number(agg._sum.pesoTotalKg ?? 0);
    }

    const reses = { novillo: 0, novilla: 0, vaca: 0, toro: 0, bufalo: 0 };
    let pieles = 0;
    let caliente = 0;
    for (const e of orden.eventos) {
      // Sin clasificación en Canal Caliente se cuenta como vaca (lo más común).
      reses[e.canalAnimalTipo ? COLUMNA[e.canalAnimalTipo] : 'vaca']++;
      pieles += Number(e.pesoPielKg ?? 0);
      caliente += e.canalPiezas.reduce((s, p) => s + Number(p.pesoKg), 0);
    }

    const unico = (vals: (string | null)[]) =>
      [...new Set(vals.map((v) => v?.trim()).filter(Boolean))].join(' / ') || null;
    const r2 = (n: number) => Math.round(n * 100) / 100;

    const data = {
      plantId,
      fecha: orden.date,
      proveedor: unico(camiones.map((c) => c.proveedor)),
      firmador: orden.cliente,
      cliente: orden.cliente,
      granja: unico(camiones.map((c) => c.procedencia)),
      guiaIca: guias.join(' / ') || null,
      lote: orden.reference,
      ...reses,
      pieles: Math.round(pieles),
      pesoPieKg: pesoPie ? r2(pesoPie) : null,
      pesoCalienteKg: r2(caliente),
      tarifa: await this.tarifaDe(plantId, orden.cliente),
    };
    return this.prisma.historicoBeneficio.upsert({
      where: { ordenBeneficioId },
      create: { ...data, ordenBeneficioId, createdById: orden.createdById },
      // El municipio no existe en la app: se respeta el que se digite a mano.
      update: data,
    });
  }

  /** Pasa al histórico todas las órdenes ya terminadas (p. ej. las anteriores a esta función). */
  async sincronizarTodas(plantId: string) {
    const ordenes = await this.prisma.ordenBeneficio.findMany({
      where: { plantId, deletedAt: null, eventos: { some: { canalPiezas: { some: {} } } } },
      select: { id: true },
      orderBy: { reference: 'asc' },
    });
    let filas = 0;
    for (const o of ordenes) if (await this.sincronizarOrden(plantId, o.id)) filas++;
    return { ordenes: ordenes.length, filas };
  }
}
