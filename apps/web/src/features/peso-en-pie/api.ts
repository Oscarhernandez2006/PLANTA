import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type PesoEnPieStatus =
  | 'pendiente'
  | 'en_insensibilizacion'
  | 'procesado';
export type TipoPesaje = 'individual' | 'promediado';

export interface PesoEnPie {
  id: string;
  reference: number;
  bpReference: number;
  bcReference: number | null;
  date: string;
  guia: string | null;
  procedencia: string | null;
  proveedor: string | null;
  cliente: string | null;
  placa: string | null;
  conductor: string | null;
  corral: string | null;
  tipoAnimal: string | null;
  lote: string | null;
  animalNo: string | null;
  animalCount: number;
  tipoPesaje: TipoPesaje;
  pesoTotalKg: number | null;
  pesoPromedioKg: number | null;
  cantidad: number | null;
  entrada: number | null;
  salida: number | null;
  observaciones: string | null;
  status: PesoEnPieStatus;
}

// Consecutivo de producción de Báscula en Pie: BP + 6 dígitos (BP000001).
export function formatBP(n: number) {
  return `BP${String(n).padStart(6, '0')}`;
}

// Identificador de animal dentro de su BP: BP000001-A01 (la "A" deja explícito
// que es un Animal, no otro tipo de sub-documento).
export function formatAnimal(bpReference: number, reference: number) {
  return `${formatBP(bpReference)}-A${String(reference).padStart(2, '0')}`;
}

export interface SavePesoEnPieInput {
  date?: string;
  bcReference?: number;
  guia?: string;
  procedencia?: string;
  proveedor?: string;
  cliente?: string;
  placa?: string;
  conductor?: string;
  corral?: string;
  tipoAnimal?: string;
  lote?: string;
  animalNo?: string;
  animalCount: number;
  tipoPesaje?: TipoPesaje;
  pesoTotalKg?: number;
  pesoPromedioKg?: number;
  cantidad?: number;
  entrada?: number;
  salida?: number;
  observaciones?: string;
}

export function usePesoEnPieList(status?: PesoEnPieStatus) {
  return useQuery({
    queryKey: ['peso-en-pie', 'list', status ?? 'all'],
    queryFn: async () =>
      (
        await api.get<PesoEnPie[]>('/peso-en-pie', {
          params: status ? { status } : {},
        })
      ).data,
  });
}

export function usePesoEnPieNextReference(date: string, enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: ['peso-en-pie', 'next-reference', date],
    queryFn: async () =>
      (
        await api.get<{ next: number }>('/peso-en-pie/next-reference', {
          params: { date },
        })
      ).data,
  });
}

// Vista previa del BP de la guía seleccionada (real si ya tiene animales
// pesados, o estimado si aún no se guardó ninguno).
export function useBpPreview(bcReference: number | null) {
  return useQuery({
    enabled: bcReference != null,
    queryKey: ['peso-en-pie', 'bp-preview', bcReference],
    queryFn: async () =>
      (
        await api.get<{ bpReference: number; existing: boolean }>(
          '/peso-en-pie/bp-preview',
          { params: { bcReference } },
        )
      ).data,
  });
}

export function useCreatePesoEnPie() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SavePesoEnPieInput) =>
      (await api.post<PesoEnPie>('/peso-en-pie', input)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['peso-en-pie'] });
      qc.invalidateQueries({ queryKey: ['insensibilizacion'] });
    },
  });
}

export function useClosePesoEnPieGuide() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ date, guia }: { date: string; guia: string }) =>
      (
        await api.patch<{ closed: number }>('/peso-en-pie/close-guide', {}, {
          params: { date, guia },
        })
      ).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['peso-en-pie'] });
      qc.invalidateQueries({ queryKey: ['insensibilizacion'] });
    },
  });
}
