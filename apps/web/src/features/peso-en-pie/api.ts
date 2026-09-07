import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type PesoEnPieStatus =
  | 'pendiente'
  | 'en_insensibilizacion'
  | 'procesado';
export type TipoPesaje = 'individual' | 'promediado';

export interface PesoEnPie {
  id: string;
  reference: number;
  date: string;
  guia: string | null;
  corral: string | null;
  animalCount: number;
  tipoPesaje: TipoPesaje;
  pesoTotalKg: number | null;
  pesoPromedioKg: number | null;
  observaciones: string | null;
  status: PesoEnPieStatus;
}

export interface SavePesoEnPieInput {
  date?: string;
  guia?: string;
  corral?: string;
  animalCount: number;
  tipoPesaje?: TipoPesaje;
  pesoTotalKg?: number;
  pesoPromedioKg?: number;
  observaciones?: string;
}

export function usePesoEnPieList(status?: PesoEnPieStatus) {
  return useQuery({
    queryKey: ['peso-en-pie', 'list', status ?? 'all'],
    queryFn: async () =>
      (
        await api.get<PesoEnPie[]>('/peso-en-pie', {
          params: status ? { status } : {},
        })
      ).data,
  });
}

export function usePesoEnPieNextReference(date: string, enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: ['peso-en-pie', 'next-reference', date],
    queryFn: async () =>
      (
        await api.get<{ next: number }>('/peso-en-pie/next-reference', {
          params: { date },
        })
      ).data,
  });
}

export function useCreatePesoEnPie() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SavePesoEnPieInput) =>
      (await api.post<PesoEnPie>('/peso-en-pie', input)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['peso-en-pie'] });
      qc.invalidateQueries({ queryKey: ['insensibilizacion'] });
    },
  });
}
