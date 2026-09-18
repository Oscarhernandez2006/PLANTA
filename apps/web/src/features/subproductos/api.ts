import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type SubproductoUnidad = 'unidad' | 'kg';
export type SubproductoDestino = 'empresa' | 'firmante';
export type SubproductoCategoria =
  | 'retoma'
  | 'viscera_blanca'
  | 'viscera_roja'
  | 'cabeza_patas';

export interface SubItem {
  tipo: string;
  codigo: string;
  label: string;
  unidad: SubproductoUnidad;
  categoria: SubproductoCategoria;
  marcado: boolean;
  pesoKg: number | null;
  registradoAt: string | null;
  operatorName: string | null;
}

export interface SubResumenItem {
  tipo: string;
  codigo: string;
  label: string;
  unidad: SubproductoUnidad;
  categoria: SubproductoCategoria;
  marcados: number;
  esperados: number;
  totalKg: number | null;
  cantidadTotal: number | null;
}

export interface SubLote {
  cliente: string;
  ordenBeneficioIds: string[];
  references: number[];
  guias: string[];
  date: string;
  animalCount: number;
  caidos: number;
  pesados: number;
  total: number;
  subproductoDestino: SubproductoDestino;
  subproductoRetiroAt: string | null;
  cabezasPatas: boolean;
}

export interface SubAnimal {
  eventoId: string;
  reference: number;
  sequence: number;
  consecutivo: number;
  stunnedAt: string;
  items: SubItem[];
}

export interface SubLoteDetail extends SubLote {
  subproductoRetiroObservaciones: string | null;
  resumen: SubResumenItem[];
  animales: SubAnimal[];
}

export function useSubproductosLotes() {
  return useQuery({
    queryKey: ['subproductos', 'lotes'],
    queryFn: async () =>
      (await api.get<SubLote[]>('/subproductos/lotes')).data,
    // Aparecen los lotes con animales caídos en cuanto se insensibilizan.
    refetchInterval: 4000,
  });
}

export function useSubLoteDetail(cliente: string | null, date: string) {
  return useQuery({
    enabled: !!cliente,
    queryKey: ['subproductos', 'grupo', cliente, date],
    queryFn: async () =>
      (
        await api.get<SubLoteDetail>('/subproductos/grupo', {
          params: { cliente, date },
        })
      ).data,
    refetchInterval: 4000,
  });
}

export function useRegistrarSubproducto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      eventoId: string;
      tipo: string;
      pesoKg?: number;
    }) => (await api.post<{ ok: boolean }>('/subproductos', payload)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subproductos'] });
    },
  });
}

/** Deshace (desmarca) un ítem del checklist registrado por error. */
export function useDeshacerSubproducto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { eventoId: string; tipo: string }) =>
      (await api.post<{ ok: boolean }>('/subproductos/deshacer', payload))
        .data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subproductos'] });
    },
  });
}

export function useRegistrarRetiroSubproducto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      ordenBeneficioId,
      observaciones,
    }: {
      ordenBeneficioId: string;
      observaciones?: string;
    }) =>
      (
        await api.patch(
          `/orden-beneficio/${ordenBeneficioId}/subproducto-retiro`,
          { observaciones },
        )
      ).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subproductos'] });
      qc.invalidateQueries({ queryKey: ['orden-beneficio'] });
    },
  });
}

/**
 * Cavas fijas para ubicar subproductos al hacer Entrada. El "value" debe
 * coincidir exactamente con el id que usa el módulo de Inventarios
 * (CAVAS_SUBPRODUCTO = ['1','2','3']) para que lo que se guarde aquí
 * aparezca en esa pestaña.
 */
export const CAVAS_SUBPRODUCTO_OPCIONES: { value: string; label: string }[] = [
  { value: '1', label: 'Cava Subproducto 1' },
  { value: '2', label: 'Cava Subproducto 2' },
  { value: '3', label: 'Cava Subproducto Despacho' },
];

/** Asigna la cava de destino (Entrada) a los subproductos del grupo (cliente), opcionalmente solo de una categoría. */
export function useAsignarCavaSubproducto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      ordenBeneficioIds,
      cava,
      categoria,
    }: {
      ordenBeneficioIds: string[];
      cava: string;
      categoria?: SubproductoCategoria;
    }) =>
      (
        await api.patch<{ ok: boolean }>('/subproductos/grupo/cava', {
          ordenBeneficioIds,
          cava,
          categoria,
        })
      ).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subproductos'] });
    },
  });
}

