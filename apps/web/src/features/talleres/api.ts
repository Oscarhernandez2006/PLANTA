import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface ProductoKg {
  codigo: string;
  nombre: string;
  kg: number;
  unds: number;
}

export interface LineaGasto {
  concepto: string;
  categoria: string;
  base: string;
  cantidad: number;
  valorUnitario: number;
  total: number;
  manual: boolean;
}

export interface CorteFinanzas {
  codigo: string;
  precioKg: number;
  venta: number;
  participacionVenta: number | null;
  costoAsignado: number | null;
  costoKg: number | null;
}

export interface FinanzasDesposte {
  venta: number;
  costoGanado: number;
  ganadoCompleto: boolean;
  gastos: LineaGasto[];
  totalGastos: number;
  costoTotal: number;
  utilidad: number;
  margen: number | null;
  cortes: CorteFinanzas[];
  pendientes: string[];
}

export interface FinanzasAcond {
  venta: number;
  costoMP: number;
  mpCompleta: boolean;
  gastos: LineaGasto[];
  totalGastos: number;
  costoTotal: number;
  utilidad: number;
  margen: number | null;
  margenObjetivo: number;
  entradas: { codigo: string; costoKg: number | null; costo: number }[];
  cortes: (CorteFinanzas & { costoMpKg: number | null; costoIntegralKg: number | null; precioSugeridoKg: number | null })[];
  pendientes: string[];
}

export interface LoteDesposte {
  id: string;
  opNumber: number;
  odNumber: number;
  fecha: string;
  fechaSacrificio: string | null;
  clienteId: string;
  cliente: string;
  status: 'activo' | 'inactivo' | 'facturado';
  /** Canales equivalentes (una media canal suelta cuenta 0,5). */
  canales: number;
  animales: Record<string, number>;
  kgCaliente: number;
  kgFrio: number;
  canalesSinFrio: number;
  kgProducido: number;
  kgRetoma: number;
  etiquetas: number;
  canastillas: number;
  productos: ProductoKg[];
  finanzas: FinanzasDesposte | null;
}

export interface ProcesoAcond {
  otId: string;
  otNumber: number;
  ocNumbers: number[];
  fecha: string;
  clienteId: string;
  cliente: string;
  procesos: ('inyectado' | 'porcionado')[];
  activo: boolean;
  lotesOrigen: number[];
  entradaKg: number;
  salidaKg: number;
  etiquetas: number;
  entradas: ProductoKg[];
  salidas: ProductoKg[];
  finanzas: FinanzasAcond | null;
}

export function useTallerDesposte(desde: string, hasta: string) {
  return useQuery({
    queryKey: ['talleres', 'desposte', desde, hasta],
    queryFn: async () =>
      (await api.get<LoteDesposte[]>('/talleres/desposte', { params: { desde: desde || undefined, hasta: hasta || undefined } })).data,
  });
}

export function useTallerAcondicionamiento(desde: string, hasta: string, margen = 10) {
  return useQuery({
    queryKey: ['talleres', 'acondicionamiento', desde, hasta, margen],
    queryFn: async () =>
      (
        await api.get<ProcesoAcond[]>('/talleres/acondicionamiento', {
          params: { desde: desde || undefined, hasta: hasta || undefined, margen },
        })
      ).data,
  });
}

// ---- Indicadores ----

/** Cociente en %, o null si no hay denominador. */
export const pct = (num: number, den: number) => (den > 0 ? (num * 100) / den : null);

export function indicadoresLote(l: LoteDesposte) {
  return {
    rendimiento: pct(l.kgProducido, l.kgFrio),
    mermaKg: l.kgFrio - l.kgProducido,
    mermaPct: pct(l.kgFrio - l.kgProducido, l.kgFrio),
    // TCA como en los talleres: lo que no es retoma sobre el peso frío.
    tca: pct(l.kgFrio - l.kgRetoma, l.kgFrio),
    oreoPct: pct(l.kgCaliente - l.kgFrio, l.kgCaliente),
    kgCanal: l.canales > 0 ? l.kgFrio / l.canales : null,
    enProceso: l.etiquetas === 0,
  };
}

export function mediana(valores: number[]) {
  if (!valores.length) return null;
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}
