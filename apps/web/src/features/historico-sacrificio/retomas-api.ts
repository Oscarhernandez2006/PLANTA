import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** Fila de la hoja RETOMAS (los totales se calculan). */
export interface FilaRetoma {
  id: string;
  fecha: string;
  firmador: string | null;
  reses: number;
  cabezas: number | null;
  despojos: number | null;
  libros: number | null;
  pielesKg: number | null;
  viscerasRojas: number | null;
  seboKg: number | null;
  valorCabezas: number;
  valorDespojos: number;
  valorLibros: number;
  valorPieles: number;
  valorViscerasRojas: number;
  valorSebo: number;
}

export type SaveFilaRetoma = Omit<FilaRetoma, 'id' | 'firmador'> & { firmador: string };

export interface TarifaSubproducto {
  id: string;
  cliente: string;
  cabezas: number;
  despojos: number;
  libros: number;
  pieles: number;
  sebo: number;
  viscerasRojas: number;
}

/** Conceptos de la hoja: [clave de cantidad, clave de valor, clave de tarifa, título]. */
export const CONCEPTOS = [
  ['cabezas', 'valorCabezas', 'cabezas', 'Cabezas'],
  ['despojos', 'valorDespojos', 'despojos', 'Despojos'],
  ['libros', 'valorLibros', 'libros', 'Libros'],
  ['pielesKg', 'valorPieles', 'pieles', 'Pieles'],
  ['viscerasRojas', 'valorViscerasRojas', 'viscerasRojas', 'Vísceras rojas'],
  ['seboKg', 'valorSebo', 'sebo', 'Sebo'],
] as const;

export type Concepto = (typeof CONCEPTOS)[number];

/** Totales por concepto (cantidad × valor) y total de la fila. */
export function totalesRetoma(f: FilaRetoma) {
  const porConcepto = CONCEPTOS.map(([q, v]) => (f[q] ?? 0) * f[v]);
  return { porConcepto, total: porConcepto.reduce((s, x) => s + x, 0) };
}

const KEY = ['historico-sacrificio', 'retomas'];

export function useRetomas(desde: string, hasta: string) {
  return useQuery({
    queryKey: [...KEY, desde, hasta],
    queryFn: async () =>
      (
        await api.get<FilaRetoma[]>('/historico-sacrificio/retomas', {
          params: { desde: desde || undefined, hasta: hasta || undefined },
        })
      ).data,
  });
}

export function useFirmadoresRetomas() {
  return useQuery({
    queryKey: [...KEY, 'firmadores'],
    queryFn: async () => (await api.get<string[]>('/historico-sacrificio/retomas/firmadores')).data,
    staleTime: 5 * 60 * 1000,
  });
}

export function useTarifasSubproductos() {
  return useQuery({
    queryKey: ['historico-sacrificio', 'tarifas-subproductos'],
    queryFn: async () =>
      (await api.get<TarifaSubproducto[]>('/historico-sacrificio/tarifas-subproductos')).data,
  });
}

export function useGuardarRetoma() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: SaveFilaRetoma }) =>
      id
        ? (await api.patch<FilaRetoma>(`/historico-sacrificio/retomas/${id}`, input)).data
        : (await api.post<FilaRetoma>('/historico-sacrificio/retomas', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useBorrarRetoma() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.delete<{ id: string }>(`/historico-sacrificio/retomas/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
