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

export interface PielLote {
  ordenBeneficioId: string;
  reference: number;
  cliente: string;
  guias: string[];
  date: string;
  consecutivoBase: number;
  animalCount: number;
  caidos: number;
  pesados: number;
}

export interface PielAnimal {
  eventoId: string;
  sequence: number;
  consecutivo: number;
  stunnedAt: string;
  pesado: boolean;
  pesoKg: number | null;
  pieladoAt: string | null;
  operatorName: string | null;
}

export interface PielLoteDetail extends PielLote {
  animales: PielAnimal[];
}

export function usePielesLotes() {
  return useQuery({
    queryKey: ['pieles', 'lotes'],
    queryFn: async () => (await api.get<PielLote[]>('/pieles/lotes')).data,
    // Aparecen los lotes con animales caídos en cuanto se insensibilizan.
    refetchInterval: 4000,
  });
}

export function usePielLoteDetail(ordenBeneficioId: string | null) {
  return useQuery({
    enabled: !!ordenBeneficioId,
    queryKey: ['pieles', 'lote', ordenBeneficioId],
    queryFn: async () =>
      (await api.get<PielLoteDetail>(`/pieles/lotes/${ordenBeneficioId}`)).data,
    refetchInterval: 4000,
  });
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

export function useRegistrarPielLote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      ordenBeneficioId: string;
      pesoTotalKg: number;
    }) =>
      (await api.post<{ ok: boolean; count: number }>('/pieles/lote', payload))
        .data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pieles'] });
    },
  });
}
