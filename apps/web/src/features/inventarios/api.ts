import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export const CAVAS = ['1', '2', '3', '4', '5', '6'];
export const CAVAS_SUBPRODUCTO = ['1', '2', '3'];

export interface CavaAnimalRow {
  eventoId: string;
  reference: number;
  cliente: string;
  date: string;
  canalAnimalTipo: string | null;
  bodega: string | null;
  destino: string | null;
  observaciones: string | null;
  piezas: number;
  pesoTotalKg: number;
}

export interface CavaSubproductoRow {
  itemId: string;
  tipo: string;
  pesoKg: number | null;
  reference: number;
  cliente: string;
  date: string;
  registradoAt: string | null;
}

export function useCava(cava: string) {
  return useQuery({
    queryKey: ['inventarios', 'cava', cava],
    queryFn: async () =>
      (await api.get<CavaAnimalRow[]>(`/inventarios/cavas/${cava}`)).data,
    refetchInterval: 5000,
  });
}

export function useCavaSubproducto(cava: string) {
  return useQuery({
    queryKey: ['inventarios', 'cava-subproducto', cava],
    queryFn: async () =>
      (
        await api.get<CavaSubproductoRow[]>(
          `/inventarios/cavas-subproducto/${cava}`,
        )
      ).data,
    refetchInterval: 5000,
  });
}
