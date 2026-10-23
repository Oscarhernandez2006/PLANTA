import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** Fila de la hoja BENEFICIO (columnas digitadas; las demás se calculan). */
export interface FilaBeneficio {
  id: string;
  /** Orden de beneficio de la que se generó sola la fila (null = Excel o digitada). */
  ordenBeneficioId?: string | null;
  fecha: string;
  proveedor: string | null;
  firmador: string | null;
  cliente: string | null;
  granja: string | null;
  municipio: string | null;
  guiaIca: string | null;
  lote: number | null;
  novillo: number;
  novilla: number;
  vaca: number;
  toro: number;
  bufalo: number;
  pieles: number | null;
  pesoPieKg: number | null;
  pesoCalienteKg: number | null;
  tarifa: number | null;
}

export type SaveFilaBeneficio = Omit<FilaBeneficio, 'id' | 'tarifa' | 'ordenBeneficioId'>;

/** Igual que en el API: compara nombres sin tildes, puntos ni "SAS". */
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

export interface TarifaSacrificio {
  id: string;
  cliente: string;
  valorBase: number;
}

export type OpcionesBeneficio = Record<'proveedor' | 'firmador' | 'cliente' | 'granja' | 'municipio', string[]> & {
  siguienteLote: number;
};

const KEY = ['historico-sacrificio'];

export function useBeneficio(desde: string, hasta: string) {
  return useQuery({
    queryKey: [...KEY, 'beneficio', desde, hasta],
    queryFn: async () =>
      (
        await api.get<FilaBeneficio[]>('/historico-sacrificio/beneficio', {
          params: { desde: desde || undefined, hasta: hasta || undefined },
        })
      ).data,
  });
}

export function useOpcionesBeneficio() {
  return useQuery({
    queryKey: [...KEY, 'opciones'],
    queryFn: async () =>
      (await api.get<OpcionesBeneficio>('/historico-sacrificio/beneficio/opciones')).data,
    staleTime: 5 * 60 * 1000,
  });
}

export function useTarifasSacrificio() {
  return useQuery({
    queryKey: [...KEY, 'tarifas'],
    queryFn: async () => (await api.get<TarifaSacrificio[]>('/historico-sacrificio/tarifas')).data,
  });
}

export function useGuardarBeneficio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: SaveFilaBeneficio }) =>
      id
        ? (await api.patch<FilaBeneficio>(`/historico-sacrificio/beneficio/${id}`, input)).data
        : (await api.post<FilaBeneficio>('/historico-sacrificio/beneficio', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useBorrarBeneficio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.delete<{ id: string }>(`/historico-sacrificio/beneficio/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

// ---------- Columnas calculadas (mismas fórmulas de la hoja) ----------

function fechaLocal(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** NUM.DE.SEMANA(fecha; 1): semanas de domingo a sábado, la del 1 de enero es la 1. */
export function semanaDe(iso: string) {
  const f = fechaLocal(iso);
  const ene1 = new Date(f.getFullYear(), 0, 1);
  const dia = Math.round((f.getTime() - ene1.getTime()) / 86400000);
  return Math.floor((dia + ene1.getDay()) / 7) + 1;
}

export function totalReses(f: Pick<FilaBeneficio, 'novillo' | 'novilla' | 'vaca' | 'toro' | 'bufalo'>) {
  return f.novillo + f.novilla + f.vaca + f.toro + f.bufalo;
}

export function calcular(f: FilaBeneficio) {
  const reses = totalReses(f);
  const caliente = f.pesoCalienteKg ?? 0;
  const pie = f.pesoPieKg ?? 0;
  const tarifa = f.tarifa ?? 0;
  return {
    semana: semanaDe(f.fecha),
    reses,
    promedio: reses ? caliente / reses : 0,
    rendimiento: pie ? (caliente * 100) / pie : 0,
    tarifa,
    totalSacrificio: reses * tarifa,
  };
}

/** Fecha larga como en la hoja: "viernes, enero 02, 2026". */
export function fechaLarga(iso: string) {
  const f = fechaLocal(iso);
  const dia = f.toLocaleDateString('es-CO', { weekday: 'long' });
  const mes = f.toLocaleDateString('es-CO', { month: 'long' });
  return `${dia}, ${mes} ${String(f.getDate()).padStart(2, '0')}, ${f.getFullYear()}`;
}

export const pesos = (n: number) =>
  `$ ${Math.round(n).toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;

export const decimal = (n: number, d: number) =>
  n.toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });
