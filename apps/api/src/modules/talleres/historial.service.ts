import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthContext } from '../../common/auth/auth-context';
import { plantDateOnly, plantToday } from '../../common/plant-date';

export type ModuloHistorial = 'desposte' | 'acondicionamiento' | 'maestros';

export interface EventoHistorial {
  fecha: string;
  userId: string | null;
  usuario: string | null;
  modulo: ModuloHistorial;
  accion: string;
  referencia: string | null;
  descripcion: string;
  detalle: unknown;
}

const dinero = (v: unknown) =>
  typeof v === 'number' ? v.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 2 }) : '—';
const kg = (v: number) => `${v.toLocaleString('es-CO', { maximumFractionDigits: 2 })} kg`;
const diaPlanta = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(d);

const ENTIDAD: Record<string, string> = {
  lista_precios: 'Lista de precios',
  tarifa: 'Tarifa',
  reglas_corte: 'Reglas por corte',
  costo_ganado: 'Costo de ganado',
  servicios: 'Cantidades de servicios',
};
const ACCION: Record<string, string> = {
  crear: 'Creó',
  editar: 'Modificó',
  eliminar: 'Eliminó',
  precios: 'Cambió precios de',
  activar: 'Activó',
  desactivar: 'Desactivó',
};

/** Texto legible de un registro de la bitácora. */
function describir(accion: string, entidad: string, referencia: string | null, d: Record<string, unknown> | null) {
  const base = `${ACCION[accion] ?? accion} ${(ENTIDAD[entidad] ?? entidad).toLowerCase()} ${referencia ?? ''}`.trim();
  if (!d) return base;
  if (entidad === 'tarifa' && accion !== 'activar' && accion !== 'desactivar') {
    return `${base}${d.cliente ? ` (${d.cliente})` : ''}: ${d.antes != null ? `${dinero(d.antes)} → ` : ''}${dinero(d.despues)} desde ${d.vigenteDesde}`;
  }
  if (entidad === 'lista_precios' && accion === 'precios') return `${base}: ${d.total} producto(s)`;
  if (entidad === 'costo_ganado') {
    const fmt = (x: unknown) => {
      const v = x as { metodo: string; valorUnitario: number } | null;
      return v ? `${v.metodo.replace('_', ' ')} a ${dinero(v.valorUnitario)}` : '';
    };
    return `${base}: ${d.antes ? `${fmt(d.antes)}${d.despues ? ' → ' : ''}` : ''}${fmt(d.despues ?? null)}`;
  }
  if (entidad === 'reglas_corte') return `${base}: ${d.retoma} retoma, ${d.piking} piking, ${d.congelacion} congelación`;
  return base;
}

/**
 * Historial de los talleres: cambios en precios, tarifas, reglas, costos y
 * cantidades (bitácora) más los hechos de producción (órdenes creadas,
 * etiquetado por operario y día, y etiquetas anuladas).
 */
@Injectable()
export class HistorialService {
  constructor(private readonly prisma: PrismaService) {}

  async historial(ctx: AuthContext, desde?: string, hasta?: string) {
    const hoy = plantToday();
    const ini = plantDateOnly(desde ?? `${hoy.slice(0, 7)}-01`);
    const finDia = plantDateOnly(hasta ?? hoy);
    // Rango en hora de planta: desde las 00:00 del primer día hasta el final del último.
    const gte = new Date(ini.getTime() + 5 * 3600_000);
    const lt = new Date(finDia.getTime() + 29 * 3600_000);
    const rango = { gte, lt };
    const plantId = ctx.plantId;

    const [actividad, ops, ocs, etiquetas, etiquetasAcond, anuladas, anuladasAcond] = await Promise.all([
      this.prisma.tallerActividad.findMany({ where: { plantId, createdAt: rango }, orderBy: { createdAt: 'desc' }, take: 2000 }),
      this.prisma.productionOrder.findMany({
        where: { plantId, createdAt: rango },
        select: { opNumber: true, createdAt: true, createdById: true, cliente: { select: { concepto: true } }, dispatchOrder: { select: { odNumber: true } } },
      }),
      this.prisma.conditioningOrder.findMany({
        where: { plantId, createdAt: rango },
        select: { ocNumber: true, proceso: true, createdAt: true, createdById: true, cliente: { select: { concepto: true } }, transferOrder: { select: { otNumber: true } } },
      }),
      this.prisma.rotuladoEtiqueta.findMany({
        where: { plantId, createdAt: rango },
        select: { createdAt: true, createdById: true, netoKg: true, productionOrder: { select: { opNumber: true } } },
      }),
      this.prisma.acondicionamientoEtiqueta.findMany({
        where: { plantId, createdAt: rango },
        select: { createdAt: true, createdById: true, netoKg: true, conditioningOrder: { select: { ocNumber: true } } },
      }),
      this.prisma.rotuladoEtiqueta.findMany({
        where: { plantId, deletedAt: rango },
        select: { deletedAt: true, deletedById: true, pieza: true, netoKg: true, codigo: true, product: { select: { nombre: true } }, productionOrder: { select: { opNumber: true } } },
      }),
      this.prisma.acondicionamientoEtiqueta.findMany({
        where: { plantId, deletedAt: rango },
        select: { deletedAt: true, deletedById: true, pieza: true, netoKg: true, codigo: true, product: { select: { nombre: true } }, conditioningOrder: { select: { ocNumber: true } } },
      }),
    ]);

    const eventos: Omit<EventoHistorial, 'usuario'>[] = [];
    for (const a of actividad) {
      eventos.push({
        fecha: a.createdAt.toISOString(),
        userId: a.userId,
        modulo: 'maestros',
        accion: a.accion,
        referencia: a.referencia,
        descripcion: describir(a.accion, a.entidad, a.referencia, a.detalle as Record<string, unknown> | null),
        detalle: a.detalle,
      });
    }
    for (const o of ops) {
      eventos.push({
        fecha: o.createdAt.toISOString(),
        userId: o.createdById,
        modulo: 'desposte',
        accion: 'crear',
        referencia: `OP ${o.opNumber}`,
        descripcion: `Creó la orden de producción OP ${o.opNumber} (traslado OD ${o.dispatchOrder.odNumber}) para ${o.cliente.concepto}`,
        detalle: null,
      });
    }
    for (const o of ocs) {
      eventos.push({
        fecha: o.createdAt.toISOString(),
        userId: o.createdById,
        modulo: 'acondicionamiento',
        accion: 'crear',
        referencia: `OC ${o.ocNumber}`,
        descripcion: `Creó la orden de acondicionamiento OC ${o.ocNumber} (${o.proceso}, traslado OT ${o.transferOrder.otNumber}) para ${o.cliente.concepto}`,
        detalle: null,
      });
    }
    // Etiquetado: una línea por orden, operario y día (con la hora de la última etiqueta).
    const agrupar = <T extends { createdAt: Date; createdById: string; netoKg: unknown }>(filas: T[], orden: (f: T) => string, modulo: ModuloHistorial) => {
      const g = new Map<string, { fecha: Date; userId: string; orden: string; n: number; kg: number }>();
      for (const f of filas) {
        const clave = `${orden(f)}|${f.createdById}|${diaPlanta(f.createdAt)}`;
        const v = g.get(clave) ?? { fecha: f.createdAt, userId: f.createdById, orden: orden(f), n: 0, kg: 0 };
        v.n += 1;
        v.kg += Number(f.netoKg);
        if (f.createdAt > v.fecha) v.fecha = f.createdAt;
        g.set(clave, v);
      }
      for (const v of g.values()) {
        eventos.push({
          fecha: v.fecha.toISOString(),
          userId: v.userId,
          modulo,
          accion: 'etiquetar',
          referencia: v.orden,
          descripcion: `Etiquetó ${v.n} empaque(s) en ${v.orden}: ${kg(v.kg)}`,
          detalle: null,
        });
      }
    };
    agrupar(etiquetas, (f) => `OP ${f.productionOrder.opNumber}`, 'desposte');
    agrupar(etiquetasAcond, (f) => `OC ${f.conditioningOrder.ocNumber}`, 'acondicionamiento');
    for (const e of anuladas) {
      eventos.push({
        fecha: e.deletedAt!.toISOString(),
        userId: e.deletedById,
        modulo: 'desposte',
        accion: 'anular',
        referencia: `OP ${e.productionOrder.opNumber}`,
        descripcion: `Anuló la etiqueta ${e.codigo ?? `#${e.pieza}`} de ${e.product.nombre} (${kg(Number(e.netoKg))}) en OP ${e.productionOrder.opNumber}`,
        detalle: null,
      });
    }
    for (const e of anuladasAcond) {
      eventos.push({
        fecha: e.deletedAt!.toISOString(),
        userId: e.deletedById,
        modulo: 'acondicionamiento',
        accion: 'anular',
        referencia: `OC ${e.conditioningOrder.ocNumber}`,
        descripcion: `Anuló la etiqueta ${e.codigo} de ${e.product.nombre} (${kg(Number(e.netoKg))}) en OC ${e.conditioningOrder.ocNumber}`,
        detalle: null,
      });
    }

    const ids = [...new Set(eventos.map((e) => e.userId).filter((x): x is string => !!x))];
    const usuarios = await this.prisma.appUser.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } });
    const nombre = new Map(usuarios.map((u) => [u.id, u.fullName]));
    return eventos
      .map<EventoHistorial>((e) => ({ ...e, usuario: e.userId ? (nombre.get(e.userId) ?? null) : null }))
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
      .slice(0, 3000);
  }
}
