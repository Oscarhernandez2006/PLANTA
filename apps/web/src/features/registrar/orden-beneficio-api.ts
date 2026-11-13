import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { plantToday as today } from '@/lib/utils';

export type OrdenBeneficioStatus = 'activo' | 'inactivo' | 'procesado';

export type SubproductoDestino = 'empresa' | 'firmante';

/** Animal de Peso en Pie aún sin orden de beneficio. */
export interface AnimalDisponible {
  id: string;
  reference: number;
  tipoAnimal: string | null;
  corral: string | null;
  pesoKg: number | null;
}

export interface OrdenBeneficioGuiaDetalle {
  guia: string;
  corrales: string[];
  animalesEnPie: number;
  asignados: number;
  disponibles: number;
  pcReference: number | null;
  bpReference: number | null;
  animales: AnimalDisponible[];
}

/** Animal asignado a una orden (solo en el detalle `GET /orden-beneficio/:id`). */
export interface OrdenBeneficioAnimal {
  id: string;
  sequence: number;
  reference: number;
  tipoAnimal: string | null;
  corral: string | null;
  pesoKg: number | null;
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
  subproductoDestino: SubproductoDestino;
  subproductoRetiroAt: string | null;
  subproductoRetiroObservaciones: string | null;
  cabezasPatas: boolean;
  // Trazabilidad: consecutivos BC (Peso en Camión) y BP (Peso en Pie) de origen.
  pcReference: number | null;
  bpReference: number | null;
}

// Consecutivo de Orden de Beneficio: OB + 7 dígitos (OB0000001).
export function formatOB(n: number) {
  return `OB${n}`;
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

export function useOrdenBeneficioNextReference(date: string = today()) {
  return useQuery({
    queryKey: ['orden-beneficio', 'next-reference', date],
    queryFn: async () =>
      (
        await api.get<{ next: number }>('/orden-beneficio/next-reference', {
          params: { date },
        })
      ).data,
  });
}

export function useOrdenBeneficioList(from: string = today(), to: string = from) {
  return useQuery({
    queryKey: ['orden-beneficio', 'list', from, to],
    queryFn: async () =>
      (
        await api.get<OrdenBeneficio[]>('/orden-beneficio', {
          params: { from, to },
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
      animalCount?: number;
      animalIds?: string[];
      date?: string;
      status?: OrdenBeneficioStatus;
      subproductoDestino?: SubproductoDestino;
      cabezasPatas?: boolean;
    }) => (await api.post<OrdenBeneficio>('/orden-beneficio', input)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orden-beneficio'] });
      qc.invalidateQueries({ queryKey: ['sacrificio'] });
    },
  });
}

/**
 * Divide la guía en varias órdenes consecutivas (todas o ninguna):
 * `animales[i]` son los ids de Peso en Pie que van en la orden i.
 */
export function useDividirOrdenBeneficio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      cliente: string;
      guia: string;
      animales: string[][];
      date?: string;
      status?: OrdenBeneficioStatus;
    }) => (await api.post<OrdenBeneficio[]>('/orden-beneficio/dividir', input)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orden-beneficio'] });
      qc.invalidateQueries({ queryKey: ['sacrificio'] });
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
      qc.invalidateQueries({ queryKey: ['sacrificio'] });
    },
  });
}

export function useSetSubproductoDestino() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      subproductoDestino,
    }: {
      id: string;
      subproductoDestino: SubproductoDestino;
    }) =>
      (
        await api.patch<OrdenBeneficio>(
          `/orden-beneficio/${id}/subproducto-destino`,
          { subproductoDestino },
        )
      ).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orden-beneficio'] });
      qc.invalidateQueries({ queryKey: ['subproductos'] });
    },
  });
}

export function useRegistrarRetiroSubproducto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      observaciones,
    }: {
      id: string;
      observaciones?: string;
    }) =>
      (
        await api.patch<OrdenBeneficio>(
          `/orden-beneficio/${id}/subproducto-retiro`,
          { observaciones },
        )
      ).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orden-beneficio'] });
      qc.invalidateQueries({ queryKey: ['subproductos'] });
    },
  });
}
