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

// Consecutivo de producción de Recibo en Posta: RP + 6 dígitos (RP000001).
export function formatRP(n: number) {
  return `RP${String(n).padStart(6, '0')}`;
}

// Identificador de pieza/animal dentro de su orden: RP000001-01 (igual patrón que formatRC/formatPieza).
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
  product: { id: string; codigo: string; nombre: string };
  createdAt: string;
}

export interface CreatePostaReceiptItemInput {
  productId: string;
  taraKg: number;
  brutoKg: number;
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
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['posta-receipts', 'items', orderId] }),
  });
}

export function useDeletePostaReceiptItem(orderId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (itemId: string) =>
      (await api.delete<{ ok: boolean }>(`/posta-receipts/items/${itemId}`))
        .data,
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['posta-receipts', 'items', orderId] }),
  });
}
