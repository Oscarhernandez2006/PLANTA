import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

// Debe coincidir EXACTO con los valores que guarda Canal Caliente/Traslado
// en OrdenBeneficioEvento.cava (apps/web/src/features/canal-caliente/api.ts),
// o esta pestaña nunca mostraría las canales ubicadas ahí.
export const CAVAS = [
  'CAVA 1',
  'CAVA 2',
  'CAVA 3',
  'CAVA 4',
  'CAVA 5',
  'SALA DE OREO',
  'CAVA DESPACHO',
];
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

export type CavaSubproductoCategoria =
  | 'retoma'
  | 'viscera_blanca'
  | 'viscera_roja'
  | 'cabeza_patas';

export interface CavaSubproductoRow {
  itemId: string;
  tipo: string;
  codigo: string;
  label: string;
  unidad: 'unidad' | 'kg';
  categoria: CavaSubproductoCategoria;
  cantidad: number | null;
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
