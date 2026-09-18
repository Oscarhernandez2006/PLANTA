import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type SubproductoUnidad = 'unidad' | 'kg';
export type SubproductoDestino = 'empresa' | 'firmante';
export type SubproductoCategoria = 'retoma' | 'viscera_blanca' | 'viscera_roja';

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
}

export interface SubLote {
  ordenBeneficioId: string;
  reference: number;
  cliente: string;
  guias: string[];
  date: string;
  consecutivoBase: number;
  animalCount: number;
  caidos: number;
  pesados: number;
  total: number;
  subproductoDestino: SubproductoDestino;
  subproductoRetiroAt: string | null;
}

export interface SubAnimal {
  eventoId: string;
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

export function useSubLoteDetail(ordenBeneficioId: string | null) {
  return useQuery({
    enabled: !!ordenBeneficioId,
    queryKey: ['subproductos', 'lote', ordenBeneficioId],
    queryFn: async () =>
      (await api.get<SubLoteDetail>(`/subproductos/lotes/${ordenBeneficioId}`))
        .data,
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

/** Asigna la cava de destino (Entrada) a todos los subproductos del lote. */
export function useAsignarCavaSubproducto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      ordenBeneficioId,
      cava,
    }: {
      ordenBeneficioId: string;
      cava: string;
    }) =>
      (
        await api.patch<{ ok: boolean }>(
          `/subproductos/lotes/${ordenBeneficioId}/cava`,
          { cava },
        )
      ).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subproductos'] });
    },
  });
}

