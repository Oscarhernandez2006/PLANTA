import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export const CAVAS_TRASLADO = [
  'CAVA 1',
  'CAVA 2',
  'CAVA 3',
  'CAVA 4',
  'CAVA 5',
  'SALA DE OREO',
];

export interface CanalEscaneada {
  eventoId: string;
  consecutivo: number;
  reference: number;
  cliente: string;
  cava: string | null;
}

export interface TrasladoHistorial {
  id: string;
  reference: number;
  cliente: string;
  cavaOrigen: string | null;
  cavaDestino: string;
  motivo: string;
  operatorName: string;
  createdAt: string;
}

export function useBuscarCanal() {
  return useMutation({
    mutationFn: async ({
      consecutivo,
      date,
    }: {
      consecutivo: string;
      date?: string;
    }) =>
      (
        await api.get<CanalEscaneada>('/canal-traslado/buscar', {
          params: { consecutivo, date },
        })
      ).data,
  });
}

export function useTrasladarCanal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      eventoId: string;
      cavaDestino: string;
      motivo: string;
    }) => (await api.post<{ ok: boolean }>('/canal-traslado', payload)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['canal-traslado'] });
      qc.invalidateQueries({ queryKey: ['inventarios'] });
    },
  });
}

export function useHistorialTraslados(date: string) {
  return useQuery({
    queryKey: ['canal-traslado', 'historial', date],
    queryFn: async () =>
      (
        await api.get<TrasladoHistorial[]>('/canal-traslado', {
          params: { date },
        })
      ).data,
    refetchInterval: 5000,
  });
}
