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
  return `OT${n}`;
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
  advertenciaInventario: string | null;
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
export async function buscarEtiquetaTraslado(otId: string, codigo: string, pin?: string) {
  return (
    await api.get<EtiquetaPorTrasladar>(`/transfer-orders/${otId}/etiqueta`, { params: { codigo, pin } })
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
    mutationFn: async (input: { codigo: string; pesoKg: number; taraKg: number; pin?: string }) =>
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
    mutationFn: async ({ id, pin }: { id: string; pin?: string }) =>
      (await api.patch(`/transfer-orders/${id}/cerrar`, { pin })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transfer-orders'] }),
  });
}

// ---- Gestor de órdenes ----

export type EstadoOrdenGestion = 'activo' | 'inactivo' | 'facturado' | 'anulada';

export interface OrdenTrasladoGestion extends OrdenTraslado {
  creadaPor: string;
  ocNumbers: number[];
  empaques: number;
  unds: number;
  netoKg: number;
  createdAt: string;
  closedAt: string | null;
  deletedAt: string | null;
  motivoAnulacion: string | null;
}

export interface ResumenOrdenes {
  activas: number;
  inactivas: number;
  cerradas: number;
  anuladas: number;
  cerradasHoy: number;
}

export interface FiltrosOrdenes {
  estado?: EstadoOrdenGestion;
  search?: string;
  desde?: string;
  hasta?: string;
  page: number;
}

export function useOrdenesTraslado(f: FiltrosOrdenes) {
  return useQuery({
    queryKey: ['transfer-orders', 'gestion', f],
    queryFn: async () =>
      (
        await api.get<{
          data: OrdenTrasladoGestion[];
          resumen: ResumenOrdenes;
          pagination: { page: number; pageSize: number; total: number; totalPages: number };
        }>('/transfer-orders', {
          params: {
            page: f.page,
            pageSize: 50,
            ...(f.estado ? { estado: f.estado } : {}),
            ...(f.search?.trim() ? { search: f.search.trim() } : {}),
            ...(f.desde ? { desde: f.desde } : {}),
            ...(f.hasta ? { hasta: f.hasta } : {}),
          },
        })
      ).data,
    placeholderData: (prev) => prev,
    refetchInterval: 15000,
  });
}

export interface OrdenTrasladoDetalle extends OrdenTraslado {
  createdAt: string;
  closedAt: string | null;
  deletedAt: string | null;
  motivoAnulacion: string | null;
  creadaPor: string | null;
  cerradaPor: string | null;
  anuladaPor: string | null;
  items: ItemTraslado[];
  ordenesAcondicionamiento: { id: string; ocNumber: number; status: OrdenDespachoStatus; processDate: string }[];
}

export function useOrdenTrasladoDetalle(id: string | null) {
  return useQuery({
    queryKey: ['transfer-orders', 'detalle', id],
    queryFn: async () => (await api.get<OrdenTrasladoDetalle>(`/transfer-orders/${id}`)).data,
    enabled: !!id,
  });
}

export function useActualizarOrdenTraslado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string; clienteId?: string; processDate?: string; status?: OrdenDespachoStatus }) =>
      (await api.patch(`/transfer-orders/${id}`, input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transfer-orders'] }),
  });
}

export function useAnularOrdenTraslado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string; pin: string; motivo: string }) =>
      (await api.patch(`/transfer-orders/${id}/anular`, input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transfer-orders'] }),
  });
}

export function useReabrirOrdenTraslado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, pin }: { id: string; pin: string }) =>
      (await api.patch(`/transfer-orders/${id}/reabrir`, { pin })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transfer-orders'] }),
  });
}
