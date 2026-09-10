import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type OrdenBeneficioStatus =
  | 'pendiente'
  | 'en_insensibilizacion'
  | 'procesado';

export interface OrdenBeneficioGuiaDetalle {
  guia: string;
  animalesEnPie: number;
  asignados: number;
  disponibles: number;
}

export interface OrdenBeneficioCandidate {
  cliente: string;
  guiasDetalle: OrdenBeneficioGuiaDetalle[];
  totalDisponibles: number;
}

export interface OrdenBeneficio {
  id: string;
  reference: number;
  date: string;
  cliente: string;
  guias: string[];
  animalCount: number;
  observaciones: string | null;
  status: OrdenBeneficioStatus;
  insensibilizados: number;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function useOrdenBeneficioCandidates(date: string = today()) {
  return useQuery({
    queryKey: ['orden-beneficio', 'candidates', date],
    queryFn: async () =>
      (
        await api.get<OrdenBeneficioCandidate[]>('/orden-beneficio/candidates', {
          params: { date },
        })
      ).data,
  });
}

export function useOrdenBeneficioList(date: string = today()) {
  return useQuery({
    queryKey: ['orden-beneficio', 'list', date],
    queryFn: async () =>
      (
        await api.get<OrdenBeneficio[]>('/orden-beneficio', {
          params: { date },
        })
      ).data,
  });
}

export function useCreateOrdenBeneficio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      cliente: string;
      guia: string;
      animalCount: number;
      date?: string;
    }) => (await api.post<OrdenBeneficio>('/orden-beneficio', input)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orden-beneficio'] });
      qc.invalidateQueries({ queryKey: ['insensibilizacion'] });
    },
  });
}

export function useDeleteOrdenBeneficio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.delete(`/orden-beneficio/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orden-beneficio'] });
      qc.invalidateQueries({ queryKey: ['insensibilizacion'] });
    },
  });
}
