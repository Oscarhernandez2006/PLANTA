import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { OrdenDespachoStatus } from './orden-despacho-api';

export interface OrdenTraslado {
  id: string;
  otNumber: number;
  registrationDate: string;
  processDate: string;
  status: OrdenDespachoStatus;
  cliente: { id: string; nit: string | null; concepto: string };
}

// Consecutivo de Orden de Traslado: OT + 7 dígitos (OT0000001).
export function formatOT(n: number) {
  return `OT${String(n).padStart(7, '0')}`;
}

export function useOrdenTrasladoNextNumber() {
  return useQuery({
    queryKey: ['transfer-orders', 'next-number'],
    queryFn: async () =>
      (await api.get<{ next: number }>('/transfer-orders/next-number')).data,
  });
}

export function useCreateOrdenTraslado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      clienteId: string;
      registrationDate: string;
      processDate: string;
      status: OrdenDespachoStatus;
    }) => (await api.post<OrdenTraslado>('/transfer-orders', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transfer-orders'] }),
  });
}

/** Tipo de las órdenes de traslado (se muestra junto al cliente). */
export const TIPO_ORDEN_TRASLADO = 'TRASLADO A PROCESO';

/** Órdenes de traslado activas, de la más reciente a la más antigua. */
export function useOrdenesTrasladoActivas() {
  return useQuery({
    queryKey: ['transfer-orders', 'activas'],
    queryFn: async () =>
      (
        await api.get<{ data: OrdenTraslado[] }>('/transfer-orders', {
          params: { status: 'activo', pageSize: 100 },
        })
      ).data.data,
    refetchInterval: 10000,
  });
}

export interface EtiquetaPorTrasladar {
  tipo: 'pieza' | 'canastilla';
  codigo: string;
  productoCodigo: string;
  productoNombre: string;
  pieza: number | null;
  canastillaNumero: number | null;
  unds: number;
  netoEtiquetaKg: number;
}

export interface ItemTraslado {
  id: string;
  codigo: string;
  tipo: 'pieza' | 'canastilla';
  productoCodigo: string;
  productoNombre: string;
  unds: number;
  pesoKg: number;
  taraKg: number;
  netoKg: number;
  netoEtiquetaKg: number;
  createdAt: string;
}

/** Valida la etiqueta pistoleada para la orden (cliente y que no esté ya trasladada). */
export async function buscarEtiquetaTraslado(otId: string, codigo: string) {
  return (
    await api.get<EtiquetaPorTrasladar>(`/transfer-orders/${otId}/etiqueta`, { params: { codigo } })
  ).data;
}

export function useItemsTraslado(otId: string | null) {
  return useQuery({
    queryKey: ['transfer-orders', otId, 'items'],
    queryFn: async () => (await api.get<ItemTraslado[]>(`/transfer-orders/${otId}/items`)).data,
    enabled: !!otId,
  });
}

export function useRegistrarTraslado(otId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { codigo: string; pesoKg: number; taraKg: number }) =>
      (await api.post<ItemTraslado>(`/transfer-orders/${otId}/items`, input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transfer-orders', otId, 'items'] }),
  });
}

export function useQuitarTraslado(otId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (itemId: string) =>
      (await api.delete(`/transfer-orders/items/${itemId}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transfer-orders', otId, 'items'] }),
  });
}

export function useCerrarTraslado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (otId: string) => (await api.patch(`/transfer-orders/${otId}/cerrar`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transfer-orders'] }),
  });
}
