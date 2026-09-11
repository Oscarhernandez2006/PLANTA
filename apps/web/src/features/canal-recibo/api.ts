import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Client, DispatchOrderStatus } from '../canal-fria/api';

export type { Client, DispatchOrderStatus } from '../canal-fria/api';
export { statusLabels, statusTone } from '../canal-fria/api';

export interface CanalReceipt {
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

export interface CreateCanalReceiptInput {
  clientId: string;
  registrationDate: string;
  processDate: string;
  status: DispatchOrderStatus;
}

export function useCanalReceiptNextNumber() {
  return useQuery({
    queryKey: ['canal-receipts', 'next-number'],
    queryFn: async () =>
      (await api.get<{ next: number }>('/canal-receipts/next-number')).data,
  });
}

export function useCanalReceipts(params: {
  page: number;
  pageSize: number;
  status?: DispatchOrderStatus;
}) {
  return useQuery({
    queryKey: ['canal-receipts', 'list', params],
    queryFn: async () =>
      (
        await api.get<Paginated<CanalReceipt>>('/canal-receipts', { params })
      ).data,
  });
}

export function useCreateCanalReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateCanalReceiptInput) =>
      (await api.post<CanalReceipt>('/canal-receipts', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['canal-receipts'] }),
  });
}

export interface CanalReceiptItem {
  id: string;
  receiptOrderId: string;
  codigo: number;
  cava: number;
  pesoKg: string;
  guia: string | null;
  lote: string | null;
  identificacion: string | null;
  createdAt: string;
}

export interface CreateCanalReceiptItemInput {
  cava: number;
  pesoKg: number;
  guia?: string;
  lote?: string;
  identificacion?: string;
}

export function useCanalReceiptItems(orderId: string | null) {
  return useQuery({
    enabled: !!orderId,
    queryKey: ['canal-receipts', 'items', orderId],
    queryFn: async () =>
      (await api.get<CanalReceiptItem[]>(`/canal-receipts/${orderId}/items`))
        .data,
  });
}

export function useCreateCanalReceiptItem(orderId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateCanalReceiptItemInput) =>
      (
        await api.post<CanalReceiptItem>(
          `/canal-receipts/${orderId}/items`,
          input,
        )
      ).data,
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['canal-receipts', 'items', orderId] }),
  });
}

export function useDeleteCanalReceiptItem(orderId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (itemId: string) =>
      (await api.delete<{ ok: boolean }>(`/canal-receipts/items/${itemId}`))
        .data,
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['canal-receipts', 'items', orderId] }),
  });
}
