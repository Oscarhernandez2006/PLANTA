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
    // `sequence`: número del animal (tarjeta) a sacrificar; sin él, el primero pendiente.
    mutationFn: async ({ id, sequence }: { id: string; sequence?: number }) =>
      (await api.post<SacrificioDetail>(`/sacrificio/${id}/stun`, { sequence })).data,
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
    // `pin`: PIN de inicio de sesión de quien tumbó el último animal.
    mutationFn: async ({ id, pin }: { id: string; pin: string }) =>
      (await api.post<SacrificioDetail>(`/sacrificio/${id}/undo`, { pin })).data,
    onSuccess: (data) => {
      qc.setQueryData(['sacrificio', 'detail', data.id], data);
      qc.invalidateQueries({ queryKey: ['sacrificio', 'pendientes'] });
      qc.invalidateQueries({ queryKey: ['orden-beneficio'] });
    },
  });
}
