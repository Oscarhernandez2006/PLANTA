import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type CanalTipo =
  | 'canal_completa'
  | 'media_canal_con_cola'
  | 'media_canal_sin_cola';

export const CANAL_TIPO_LABEL: Record<CanalTipo, string> = {
  canal_completa: 'Canal completa',
  media_canal_con_cola: 'Media canal con cola',
  media_canal_sin_cola: 'Media canal sin cola',
};

export type CanalPiezaTipo = 'canal' | 'cizq' | 'cder';

export const PIEZA_LABEL: Record<CanalPiezaTipo, string> = {
  canal: 'CANAL',
  cizq: 'CIZQ',
  cder: 'CDER',
};

export type CanalTurno = 'manana' | 'tarde';

export const TURNO_LABEL: Record<CanalTurno, string> = {
  manana: 'Mañana',
  tarde: 'Tarde',
};

export interface CanalLote {
  ordenBeneficioId: string;
  reference: number;
  cliente: string;
  guias: string[];
  date: string;
  consecutivoBase: number;
  animalCount: number;
  canalTipo: CanalTipo | null;
  piezasPorAnimal: number;
  piezasEsperadas: number;
  piezasPesadas: number;
}

export interface CanalPiezaEstado {
  pieza: CanalPiezaTipo;
  pesado: boolean;
  piezaId: string | null;
  pesoKg: number | null;
  turno: CanalTurno | null;
  weighedAt: string | null;
  operatorName: string | null;
}

export interface CanalAnimal {
  eventoId: string;
  sequence: number;
  consecutivo: number;
  stunnedAt: string;
  piezas: CanalPiezaEstado[];
}

export interface CanalLoteDetail {
  ordenBeneficioId: string;
  reference: number;
  cliente: string;
  guias: string[];
  date: string;
  consecutivoBase: number;
  animalCount: number;
  canalTipo: CanalTipo | null;
  piezasPorAnimal: number;
  animales: CanalAnimal[];
}

export interface CanalAnimalRow {
  eventoId: string;
  consecutivo: number;
  reference: number;
  cliente: string;
  canalTipo: CanalTipo | null;
  piezasPesadas: number;
  piezasEsperadas: number;
  pesoTotalKg: number;
}

export interface CanalPiezaRow {
  piezaId: string;
  reference: number;
  cliente: string;
  consecutivo: number;
  pieza: CanalPiezaTipo;
  pesoKg: number;
  turno: CanalTurno | null;
  weighedAt: string;
  operatorName: string;
}

export interface CanalReporte {
  clientes: {
    cliente: string;
    animales: number;
    piezas: number;
    pesoKg: number;
  }[];
  totalPiezas: number;
  totalPesoKg: number;
}

export function useCanalLotes(date: string) {
  return useQuery({
    queryKey: ['canal-caliente', 'lotes', date],
    queryFn: async () =>
      (
        await api.get<CanalLote[]>('/canal-caliente/lotes', {
          params: { date },
        })
      ).data,
    refetchInterval: 4000,
  });
}

export function useCanalLoteDetail(ordenBeneficioId: string | null) {
  return useQuery({
    enabled: !!ordenBeneficioId,
    queryKey: ['canal-caliente', 'lote', ordenBeneficioId],
    queryFn: async () =>
      (
        await api.get<CanalLoteDetail>(
          `/canal-caliente/lotes/${ordenBeneficioId}`,
        )
      ).data,
    refetchInterval: 4000,
  });
}

export function useCanalAnimales(date: string, enabled = true) {
  return useQuery({
    enabled,
    queryKey: ['canal-caliente', 'animales', date],
    queryFn: async () =>
      (
        await api.get<CanalAnimalRow[]>('/canal-caliente/animales', {
          params: { date },
        })
      ).data,
    refetchInterval: 4000,
  });
}

export function useCanalPiezas(date: string, enabled = true) {
  return useQuery({
    enabled,
    queryKey: ['canal-caliente', 'piezas', date],
    queryFn: async () =>
      (
        await api.get<CanalPiezaRow[]>('/canal-caliente/piezas', {
          params: { date },
        })
      ).data,
    refetchInterval: 4000,
  });
}

export function useCanalReporte(date: string, enabled = true) {
  return useQuery({
    enabled,
    queryKey: ['canal-caliente', 'reporte', date],
    queryFn: async () =>
      (
        await api.get<CanalReporte>('/canal-caliente/reporte', {
          params: { date },
        })
      ).data,
    refetchInterval: 4000,
  });
}

export function useSetCanalTipo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      ordenBeneficioId: string;
      tipo: CanalTipo;
    }) =>
      (
        await api.patch<CanalLoteDetail>(
          `/canal-caliente/lotes/${payload.ordenBeneficioId}/tipo`,
          { tipo: payload.tipo },
        )
      ).data,
    onSuccess: (data) => {
      qc.setQueryData(['canal-caliente', 'lote', data.ordenBeneficioId], data);
      qc.invalidateQueries({ queryKey: ['canal-caliente'] });
    },
  });
}

export function useRegistrarCanal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      eventoId: string;
      pieza: CanalPiezaTipo;
      pesoKg: number;
      turno?: CanalTurno;
    }) => (await api.post<{ ok: boolean }>('/canal-caliente', payload)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['canal-caliente'] });
    },
  });
}

export function useDeshacerCanal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (piezaId: string) =>
      (await api.post<{ ok: boolean }>(`/canal-caliente/undo/${piezaId}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['canal-caliente'] });
    },
  });
}
