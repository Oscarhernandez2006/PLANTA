import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type TipoViscera = 'blancas' | 'rojas';

export interface SubViscera {
  pesado: boolean;
  pesoKg: number | null;
  at: string | null;
  operatorName: string | null;
}

export interface SubLote {
  ordenBeneficioId: string;
  reference: number;
  cliente: string;
  guias: string[];
  date: string;
  consecutivoBase: number;
  animalCount: number;
  caidos: number;
  pesadosBlancas: number;
  pesadosRojas: number;
}

export interface SubAnimal {
  eventoId: string;
  sequence: number;
  consecutivo: number;
  stunnedAt: string;
  blancas: SubViscera;
  rojas: SubViscera;
}

export interface SubLoteDetail extends SubLote {
  animales: SubAnimal[];
}

export function useSubproductosLotes() {
  return useQuery({
    queryKey: ['subproductos', 'lotes'],
    queryFn: async () =>
      (await api.get<SubLote[]>('/subproductos/lotes')).data,
    // Aparecen los lotes con animales caídos en cuanto se insensibilizan.
    refetchInterval: 4000,
  });
}

export function useSubLoteDetail(ordenBeneficioId: string | null) {
  return useQuery({
    enabled: !!ordenBeneficioId,
    queryKey: ['subproductos', 'lote', ordenBeneficioId],
    queryFn: async () =>
      (await api.get<SubLoteDetail>(`/subproductos/lotes/${ordenBeneficioId}`))
        .data,
    refetchInterval: 4000,
  });
}

export function useRegistrarSubproducto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      eventoId: string;
      tipo: TipoViscera;
      pesoKg: number;
    }) => (await api.post<{ ok: boolean }>('/subproductos', payload)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subproductos'] });
    },
  });
}
