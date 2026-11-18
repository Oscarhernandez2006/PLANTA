import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { DispatchOrderStatus } from '../canal-fria/api';

export type { DispatchOrderStatus } from '../canal-fria/api';
export { statusLabels, statusTone } from '../canal-fria/api';

/** Cliente del maestro de clientes del software. */
export interface ClienteRecibo {
  id: string;
  nit: string | null;
  concepto: string;
}

/** A qué cliente/bodega entra lo recibido al cerrar, o por qué aún no se puede cerrar. */
export type DestinoRecibo =
  | {
      ok: true;
      cliente: { id: string; concepto: string; nit: string };
      bodegas: { id: string; code: number; nombre: string }[];
    }
  | {
      ok: false;
      motivo: 'sin_cliente' | 'sin_nit' | 'sin_bodega';
      mensaje: string;
      cliente: { id: string; concepto: string; nit: string | null } | null;
    };

export interface CanalReceipt {
  id: string;
  receiptNumber: number;
  registrationDate: string;
  processDate: string;
  status: DispatchOrderStatus;
  cliente: ClienteRecibo;
  /** Bodega a la que entró al cerrar la orden. */
  bodega: { id: string; code: number; nombre: string } | null;
  /** Canales recibidas y kilos (solo en la lista). */
  piezas?: number;
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

export interface CreateCanalReceiptInput {
  clienteId: string;
  registrationDate: string;
  processDate: string;
  status: DispatchOrderStatus;
}

// Consecutivo de producción de Recibo de Canales: RC + número sin ceros (RC1, RC2…).
export function formatRC(n: number) {
  return `RC${n}`;
}

// Identificador de pieza/canal dentro de su orden: RC1-01 (igual patrón que formatAnimal).
export function formatPieza(receiptNumber: number, codigo: number) {
  return `${formatRC(receiptNumber)}-${String(codigo).padStart(2, '0')}`;
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
  guia: string;
  lote: string;
  identificacion: string;
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['canal-receipts', 'items', orderId] });
      qc.invalidateQueries({ queryKey: ['canal-receipts', 'list'] });
    },
  });
}

/** Eliminar una canal recibida: lo autoriza un supervisor con su PIN. */
export function useDeleteCanalReceiptItem(orderId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, pin }: { itemId: string; pin: string }) =>
      (await api.delete<{ ok: boolean }>(`/canal-receipts/items/${itemId}`, { data: { pin } }))
        .data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['canal-receipts', 'items', orderId] });
      qc.invalidateQueries({ queryKey: ['canal-receipts', 'list'] });
    },
  });
}

/** Cierra la orden de recibo con el PIN de un supervisor; lo recibido entra a la bodega elegida. */
export function useCerrarCanalReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, pin, bodegaId }: { id: string; pin: string; bodegaId?: string }) =>
      (await api.patch<{ ok: boolean }>(`/canal-receipts/${id}/cerrar`, { pin, bodegaId })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['canal-receipts'] }),
  });
}

export async function destinoCanalReceipt(id: string) {
  return (await api.get<DestinoRecibo>(`/canal-receipts/${id}/destino`)).data;
}

/** Deja constancia de la reimpresión de un rótulo; si falla no interrumpe la impresión. */
export function registrarReimpresionRecibo(itemId: string, estacion?: string | null) {
  void api
    .post(`/canal-receipts/items/${itemId}/reimpresion`, { estacion: estacion ?? undefined })
    .catch(() => undefined);
}
