import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Client, DispatchOrderStatus } from '../canal-fria/api';

export type { Client, DispatchOrderStatus } from '../canal-fria/api';
export { statusLabels, statusTone } from '../canal-fria/api';

export interface PostaReceipt {
  id: string;
  receiptNumber: number;
  registrationDate: string;
  processDate: string;
  status: DispatchOrderStatus;
  client: Client;
  /** Resumen que trae el listado. */
  registros?: number;
  piezas?: number;
  referencias?: number;
  kg?: number;
}

export interface Paginated<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface CreatePostaReceiptInput {
  clientId: string;
  registrationDate: string;
  processDate: string;
  status: DispatchOrderStatus;
}

// Consecutivo de producción de Recibo en Posta: RP + número sin ceros (RP1, RP2…).
export function formatRP(n: number) {
  return `RP${n}`;
}

// Identificador de pieza/animal dentro de su orden: RP1-01 (igual patrón que formatRC/formatPieza).
export function formatPiezaPosta(receiptNumber: number, codigo: number) {
  return `${formatRP(receiptNumber)}-${String(codigo).padStart(2, '0')}`;
}

export function usePostaReceiptNextNumber() {
  return useQuery({
    queryKey: ['posta-receipts', 'next-number'],
    queryFn: async () =>
      (await api.get<{ next: number }>('/posta-receipts/next-number')).data,
  });
}

export function usePostaReceipts(params: {
  page: number;
  pageSize: number;
  status?: DispatchOrderStatus;
}) {
  return useQuery({
    queryKey: ['posta-receipts', 'list', params],
    queryFn: async () =>
      (
        await api.get<Paginated<PostaReceipt>>('/posta-receipts', { params })
      ).data,
  });
}

export function useCreatePostaReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreatePostaReceiptInput) =>
      (await api.post<PostaReceipt>('/posta-receipts', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['posta-receipts'] }),
  });
}

export interface PostaReceiptItem {
  id: string;
  receiptOrderId: string;
  codigo: number;
  taraKg: string;
  brutoKg: string;
  netoKg: string;
  piezas: number;
  empaques: number;
  lote: string | null;
  conservacion: Conservacion | null;
  fechaSacrificio: string | null;
  fechaVencimiento: string | null;
  product: { id: string; codigo: string; nombre: string };
  createdAt: string;
}

export type Conservacion = 'refrigerado' | 'congelado';

export const CONSERVACION_LABEL: Record<Conservacion, string> = {
  refrigerado: 'REFRIGERADO 0 °C A 4 °C',
  congelado: 'CONGELADO -18 °C A -25 °C',
};

export interface CreatePostaReceiptItemInput {
  productId: string;
  taraKg: number;
  brutoKg: number;
  piezas: number;
  empaques: number;
  lote: string;
  conservacion: Conservacion;
  fechaSacrificio?: string;
  fechaVencimiento?: string;
}

export function usePostaReceiptItems(orderId: string | null) {
  return useQuery({
    enabled: !!orderId,
    queryKey: ['posta-receipts', 'items', orderId],
    queryFn: async () =>
      (await api.get<PostaReceiptItem[]>(`/posta-receipts/${orderId}/items`))
        .data,
  });
}

export function useCreatePostaReceiptItem(orderId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreatePostaReceiptItemInput) =>
      (
        await api.post<PostaReceiptItem>(
          `/posta-receipts/${orderId}/items`,
          input,
        )
      ).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['posta-receipts', 'items', orderId] });
      qc.invalidateQueries({ queryKey: ['posta-receipts', 'list'] });
    },
  });
}

/** Eliminar un registro: lo autoriza un supervisor con su PIN. */
export function useDeletePostaReceiptItem(orderId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, pin }: { itemId: string; pin: string }) =>
      (await api.delete<{ ok: boolean }>(`/posta-receipts/items/${itemId}`, { data: { pin } }))
        .data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['posta-receipts', 'items', orderId] });
      qc.invalidateQueries({ queryKey: ['posta-receipts', 'list'] });
    },
  });
}

/** Cierra la orden de recibo con el PIN de un supervisor. */
export function useCerrarPostaReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, pin }: { id: string; pin: string }) =>
      (await api.patch<{ ok: boolean }>(`/posta-receipts/${id}/cerrar`, { pin })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['posta-receipts'] }),
  });
}

/** Deja constancia de la reimpresión de un rótulo; si falla no interrumpe la impresión. */
export function registrarReimpresionPosta(itemId: string, estacion?: string | null) {
  void api
    .post(`/posta-receipts/items/${itemId}/reimpresion`, { estacion: estacion ?? undefined })
    .catch(() => undefined);
}
