import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { OrdenBeneficioStatus } from '../registrar/orden-beneficio-api';

export interface InsOrder {
  id: string;
  reference: number;
  date: string;
  cliente: string;
  guias: string[];
  animalCount: number;
  status: OrdenBeneficioStatus;
  insensibilizados: number;
}

export interface InsEvento {
  sequence: number;
  stunnedAt: string;
  operatorId: string;
  operatorName: string;
}

export interface InsDetail extends InsOrder {
  eventos: InsEvento[];
}

export function useInsensibilizacionPendientes() {
  return useQuery({
    queryKey: ['insensibilizacion', 'pendientes'],
    queryFn: async () =>
      (await api.get<InsOrder[]>('/insensibilizacion')).data,
  });
}

export function useInsensibilizacionDetail(id: string | null) {
  return useQuery({
    enabled: !!id,
    queryKey: ['insensibilizacion', 'detail', id],
    queryFn: async () =>
      (await api.get<InsDetail>(`/insensibilizacion/${id}`)).data,
  });
}

export function useStunNext() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.post<InsDetail>(`/insensibilizacion/${id}/stun`)).data,
    onSuccess: (data) => {
      qc.setQueryData(['insensibilizacion', 'detail', data.id], data);
      qc.invalidateQueries({ queryKey: ['insensibilizacion', 'pendientes'] });
      qc.invalidateQueries({ queryKey: ['orden-beneficio'] });
    },
  });
}

export function useUndoLast() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.post<InsDetail>(`/insensibilizacion/${id}/undo`)).data,
    onSuccess: (data) => {
      qc.setQueryData(['insensibilizacion', 'detail', data.id], data);
      qc.invalidateQueries({ queryKey: ['insensibilizacion', 'pendientes'] });
      qc.invalidateQueries({ queryKey: ['orden-beneficio'] });
    },
  });
}
