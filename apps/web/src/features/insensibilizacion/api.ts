import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { PesoEnPieStatus, TipoPesaje } from '../peso-en-pie/api';

export interface InsOrder {
  id: string;
  reference: number;
  date: string;
  guia: string | null;
  corral: string | null;
  animalCount: number;
  tipoPesaje: TipoPesaje;
  pesoPromedioKg: number | null;
  status: PesoEnPieStatus;
  insensibilizados: number;
}

export interface InsEvento {
  sequence: number;
  stunnedAt: string;
  operatorId: string;
  operatorName: string;
}

export interface InsDetail extends InsOrder {
  insensibilizacionStatus: 'en_proceso' | 'completada' | null;
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
      qc.invalidateQueries({ queryKey: ['peso-en-pie'] });
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
      qc.invalidateQueries({ queryKey: ['peso-en-pie'] });
    },
  });
}
