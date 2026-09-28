import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// Compartido con Recibo de Canales y Recibo en Posta.
export type DispatchOrderStatus = 'activo' | 'inactivo' | 'facturado';

export interface Client {
  id: string;
  nit: string;
  name: string;
  sede: string;
}

export function useClients() {
  return useQuery({
    queryKey: ['clients'],
    queryFn: async () => (await api.get<Client[]>('/clients')).data,
  });
}

/** Pieza de canal en cava encontrada por el código de barras del presinto. */
export interface PiezaEnCava {
  piezaId: string;
  barcode: string;
  reference: number;
  cliente: string;
  date: string;
  canalAnimalTipo: string | null;
  pieza: 'canal' | 'cizq' | 'cder';
  destino: string | null;
  cava: string;
  pesoKg: number;
  sequence: number;
  turno: number | null;
  observaciones: string | null;
}

export async function buscarPiezaPorBarcode(barcode: string) {
  return (await api.get<PiezaEnCava>('/inventarios/pieza', { params: { barcode } })).data;
}

/** Pieza que salió de su cava hacia una orden de despacho. */
export interface ItemDespacho extends Omit<PiezaEnCava, 'cava'> {
  itemId: string;
  cavaOrigen: string;
  despachoKg: number | null;
  despachadoAt: string;
}

export function useItemsDespacho(orderId: string | null) {
  return useQuery({
    queryKey: ['dispatch-orders', 'items', orderId],
    enabled: !!orderId,
    queryFn: async () =>
      (await api.get<ItemDespacho[]>(`/dispatch-orders/${orderId}/items`)).data,
  });
}

export function useAgregarItemDespacho(orderId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (barcode: string) =>
      (await api.post<ItemDespacho>(`/dispatch-orders/${orderId}/items`, { barcode })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dispatch-orders', 'items', orderId] });
      qc.invalidateQueries({ queryKey: ['inventarios'] });
    },
  });
}

/** Guarda el peso en frío (despacho) de una pieza de la orden. */
export function usePesarItemDespacho(orderId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, despachoKg }: { itemId: string; despachoKg: number }) =>
      (await api.patch<ItemDespacho>(`/dispatch-orders/items/${itemId}`, { despachoKg })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dispatch-orders', 'items', orderId] }),
  });
}

export function useQuitarItemDespacho(orderId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (itemId: string) =>
      (await api.delete(`/dispatch-orders/items/${itemId}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dispatch-orders', 'items', orderId] });
      qc.invalidateQueries({ queryKey: ['inventarios'] });
    },
  });
}

export const statusLabels: Record<DispatchOrderStatus, string> = {
  activo: 'Activo',
  inactivo: 'Inactivo',
  facturado: 'Facturado',
};

export const statusTone: Record<
  DispatchOrderStatus,
  'success' | 'neutral' | 'info'
> = {
  activo: 'success',
  inactivo: 'neutral',
  facturado: 'info',
};
