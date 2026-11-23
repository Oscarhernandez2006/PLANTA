import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ItemTraslado } from '../registrar/orden-traslado-api';

/** Órdenes que se alistan con picking en la terminal móvil. */
export type TipoPicking = 'posta' | 'traslado';

export interface ItemPicking {
  id: string;
  codigo: string;
  tipo: string;
  productoCodigo: string;
  productoNombre: string;
  unds: number;
  netoEtiquetaKg: number;
  createdAt: string;
  /** Ya se registró en la orden (se pesó su arrume). */
  pesado: boolean;
}

export interface Picking {
  id: string | null;
  orden: string;
  ordenActiva: boolean;
  status: 'en_curso' | 'terminado';
  terminadoAt: string | null;
  items: ItemPicking[];
}

export interface ArrumeInput {
  codigos: string[];
  pesoBrutoKg: number;
  taraCanastillaKg: number;
  canastillas: number;
  taraEstibaKg: number;
}

export interface ArrumeRegistrado {
  items: ItemTraslado[];
  pesoBrutoKg: number;
  taraTotalKg: number;
  netoTotalKg: number;
  netoEtiquetasKg: number;
  diferenciaKg: number;
}

export function usePicking(tipo: TipoPicking | undefined, ordenId: string | null) {
  return useQuery({
    queryKey: ['picking', tipo, ordenId],
    queryFn: async () => (await api.get<Picking>(`/picking/${tipo}/${ordenId}`)).data,
    enabled: !!tipo && !!ordenId,
    refetchInterval: 10_000,
  });
}

/** Pesa un arrume del picking y registra sus etiquetas en la orden (neto repartido por etiqueta). */
export function useRegistrarArrume(tipo: TipoPicking, ordenId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dto: ArrumeInput) =>
      (await api.post<ArrumeRegistrado>(`/picking/${tipo}/${ordenId}/arrume`, dto)).data,
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['picking', tipo, ordenId] });
      qc.invalidateQueries({
        queryKey: tipo === 'posta' ? ['canal-dispatch-orders', ordenId, 'productos'] : ['transfer-orders', ordenId, 'items'],
      });
      qc.invalidateQueries({ queryKey: ['inventarios'] });
    },
  });
}
