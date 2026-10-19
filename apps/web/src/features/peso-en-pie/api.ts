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
// pesados, o estimado si aún no se guardó ninguno) y del consecutivo del
// próximo animal a pesar.
export function useBpPreview(bcReference: number | null) {
  return useQuery({
    enabled: bcReference != null,
    queryKey: ['peso-en-pie', 'bp-preview', bcReference],
    queryFn: async () =>
      (
        await api.get<{
          bpReference: number;
          nextAnimal: number;
          existing: boolean;
        }>(
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
      qc.invalidateQueries({ queryKey: ['sacrificio'] });
    },
  });
}

// Pesaje promediado: registra de una vez los animales pendientes de la guía
// con el neto de báscula camión dividido entre ellos.
export function useRegistrarPromediado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { pesoCamionId: string; corral: string; tipoAnimal: string }) =>
      (
        await api.post<{
          creados: number;
          pesoKg: number;
          netoKg: number;
          bpReference: number;
          desde: number;
          hasta: number;
        }>('/peso-en-pie/promediado', input)
      ).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['peso-en-pie'] });
      qc.invalidateQueries({ queryKey: ['sacrificio'] });
    },
  });
}

// Actualiza un animal ya registrado (p. ej. su observación individual). El
// backend reemplaza todos los campos, así que se debe enviar el registro
// completo con solo el/los campos deseados modificados.
export function useUpdatePesoEnPie() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: SavePesoEnPieInput }) =>
      (await api.patch<PesoEnPie>(`/peso-en-pie/${id}`, input)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['peso-en-pie'] });
    },
  });
}

// ===================== Guías cerradas y repesaje =====================

export interface GuiaCerrada {
  /** Id de la guía en Peso en Camión. */
  id: string;
  bcReference: number;
  bpReference: number | null;
  date: string;
  guia: string | null;
  procedencia: string | null;
  proveedor: string | null;
  cliente: string | null;
  placa: string | null;
  conductor: string | null;
  cantidad: number | null;
  entrada: number | null;
  salida: number | null;
  neto: number | null;
  animales: number;
  pesoInicialKg: number;
  pesoActualKg: number;
  mermaKg: number;
  mermaPct: number;
  repesajeRonda: number;
  repesajeAbierto: boolean;
  repesadosRonda: number;
  puedeRepesar: boolean;
  motivoBloqueo: string | null;
}

export interface AnimalRepesaje {
  id: string;
  reference: number;
  bpReference: number;
  tipoAnimal: string | null;
  corral: string | null;
  observaciones: string | null;
  pesoInicialKg: number;
  pesoActualKg: number;
  mermaKg: number;
  mermaPct: number;
  repesadoEnRonda: boolean;
  historial: {
    ronda: number;
    pesoAnteriorKg: number;
    pesoNuevoKg: number;
    mermaKg: number;
    createdAt: string;
  }[];
}

export interface GuiaCerradaDetalle extends GuiaCerrada {
  siguienteId: string | null;
  items: AnimalRepesaje[];
}

export function formatAnimalCorto(reference: number) {
  return `A${String(reference).padStart(2, '0')}`;
}

export function useGuiasCerradas() {
  return useQuery({
    queryKey: ['peso-en-pie', 'guias-cerradas'],
    queryFn: async () =>
      (await api.get<GuiaCerrada[]>('/peso-en-pie/guias-cerradas')).data,
  });
}

export function useGuiaCerradaDetalle(id: string | null) {
  return useQuery({
    enabled: id != null,
    queryKey: ['peso-en-pie', 'guias-cerradas', id],
    queryFn: async () =>
      (await api.get<GuiaCerradaDetalle>(`/peso-en-pie/guias-cerradas/${id}`))
        .data,
  });
}

export function useIniciarRepesaje() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (
        await api.post<GuiaCerradaDetalle>(
          `/peso-en-pie/guias-cerradas/${id}/repesaje`,
        )
      ).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['peso-en-pie'] }),
  });
}

export function useFinalizarRepesaje() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (
        await api.post<GuiaCerradaDetalle & { cancelado: boolean }>(
          `/peso-en-pie/guias-cerradas/${id}/repesaje/finalizar`,
        )
      ).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['peso-en-pie'] }),
  });
}

export function useRepesarAnimal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, pesoKg }: { id: string; pesoKg: number }) =>
      (
        await api.post<{
          repesado: {
            reference: number;
            pesoAnteriorKg: number;
            pesoNuevoKg: number;
            mermaKg: number;
            finalizado: boolean;
          };
          guia: GuiaCerradaDetalle;
        }>(`/peso-en-pie/repesaje/${id}`, { pesoKg })
      ).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['peso-en-pie'] }),
  });
}
