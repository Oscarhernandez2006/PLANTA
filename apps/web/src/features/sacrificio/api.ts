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

/** Animal de Peso en Pie asignado a la orden (por número dentro de la orden). */
export interface SacrificioAnimal {
  sequence: number;
  reference: number;
  tipoAnimal: string | null;
  corral: string | null;
  pesoKg: number | null;
}

export interface SacrificioDetail extends SacrificioOrder {
  /** Vacío en órdenes creadas antes de la asignación explícita de animales. */
  animales: SacrificioAnimal[];
  eventos: SacrificioEvento[];
}

/** Sin fecha: todas las órdenes activas. Con fecha: las de ese día (últimos 30 días). */
export function useSacrificioPendientes(date: string | null = null) {
  return useQuery({
    queryKey: ['sacrificio', 'pendientes', date ?? 'activas'],
    queryFn: async () =>
      (await api.get<SacrificioOrder[]>('/sacrificio', { params: date ? { date } : {} })).data,
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
    // `sequence`: número del animal (tarjeta seleccionada) a sacrificar.
    mutationFn: async ({ id, sequence }: { id: string; sequence: number }) =>
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
    // `pin`: PIN de inicio de sesión de quien tumbó el animal.
    // `sequence`: animal a devolver (A01 = 1); sin él, el último caído.
    mutationFn: async ({ id, pin, sequence }: { id: string; pin: string; sequence?: number }) =>
      (await api.post<SacrificioDetail>(`/sacrificio/${id}/undo`, { pin, sequence })).data,
    onSuccess: (data) => {
      qc.setQueryData(['sacrificio', 'detail', data.id], data);
      qc.invalidateQueries({ queryKey: ['sacrificio', 'pendientes'] });
      qc.invalidateQueries({ queryKey: ['orden-beneficio'] });
    },
  });
}

/** Cierra la orden: desaparece de Sacrificio y ya no se tumban ni devuelven animales. */
export function useCerrarOrden() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.patch<SacrificioDetail>(`/sacrificio/${id}/cerrar`)).data,
    onSuccess: (data) => {
      qc.setQueryData(['sacrificio', 'detail', data.id], data);
      qc.invalidateQueries({ queryKey: ['sacrificio', 'pendientes'] });
      qc.invalidateQueries({ queryKey: ['orden-beneficio'] });
    },
  });
}
