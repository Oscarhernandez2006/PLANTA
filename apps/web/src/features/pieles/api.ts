import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface PielPendiente {
  eventoId: string;
  ordenBeneficioId: string;
  reference: number;
  cliente: string;
  guias: string[];
  date: string;
  consecutivo: number;
  stunnedAt: string;
}

export interface PielPesado {
  eventoId: string;
  cliente: string;
  guias: string[];
  consecutivo: number;
  pesoKg: number;
  pieladoAt: string | null;
  operatorName: string;
}

export function usePielesPendientes() {
  return useQuery({
    queryKey: ['pieles', 'pendientes'],
    queryFn: async () =>
      (await api.get<PielPendiente[]>('/pieles/pendientes')).data,
    // Aparecen los animales caídos en cuanto se insensibilizan.
    refetchInterval: 4000,
  });
}

export function usePielesPesados() {
  return useQuery({
    queryKey: ['pieles', 'pesados'],
    queryFn: async () =>
      (await api.get<PielPesado[]>('/pieles/pesados')).data,
  });
}

export function useRegistrarPiel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { eventoId: string; pesoKg: number }) =>
      (await api.post<{ ok: boolean }>('/pieles', payload)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pieles'] });
    },
  });
}
