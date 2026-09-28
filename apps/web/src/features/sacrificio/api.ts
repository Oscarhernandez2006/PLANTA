import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { OrdenBeneficioStatus } from '../registrar/orden-beneficio-api';

export interface SacrificioOrder {
  id: string;
  reference: number;
  date: string;
  cliente: string;
  clienteNit: string | null;
  guias: string[];
  animalCount: number;
  consecutivoBase: number;
  status: OrdenBeneficioStatus;
  insensibilizados: number;
  cabezasPatas: boolean;
}

export interface SacrificioEvento {
  sequence: number;
  stunnedAt: string;
  operatorId: string;
  operatorName: string;
}

export interface SacrificioDetail extends SacrificioOrder {
  eventos: SacrificioEvento[];
}

export function useSacrificioPendientes() {
  return useQuery({
    queryKey: ['sacrificio', 'pendientes'],
    queryFn: async () =>
      (await api.get<SacrificioOrder[]>('/sacrificio')).data,
  });
}

export function useSacrificioDetail(id: string | null) {
  return useQuery({
    enabled: !!id,
    queryKey: ['sacrificio', 'detail', id],
    queryFn: async () =>
      (await api.get<SacrificioDetail>(`/sacrificio/${id}`)).data,
  });
}

export function useStunNext() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.post<SacrificioDetail>(`/sacrificio/${id}/stun`)).data,
    onSuccess: (data) => {
      qc.setQueryData(['sacrificio', 'detail', data.id], data);
      qc.invalidateQueries({ queryKey: ['sacrificio', 'pendientes'] });
      qc.invalidateQueries({ queryKey: ['orden-beneficio'] });
    },
  });
}

export function useUndoLast() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.post<SacrificioDetail>(`/sacrificio/${id}/undo`)).data,
    onSuccess: (data) => {
      qc.setQueryData(['sacrificio', 'detail', data.id], data);
      qc.invalidateQueries({ queryKey: ['sacrificio', 'pendientes'] });
      qc.invalidateQueries({ queryKey: ['orden-beneficio'] });
    },
  });
}
