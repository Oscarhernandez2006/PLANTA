import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { OrdenDespachoStatus } from './orden-despacho-api';
import type { OrdenTraslado } from './orden-traslado-api';

export interface OrdenAcondicionamiento {
  id: string;
  ocNumber: number;
  registrationDate: string;
  processDate: string;
  status: OrdenDespachoStatus;
  cliente: { id: string; nit: string | null; concepto: string };
  transferOrder: { id: string; otNumber: number };
}

// Consecutivo de Orden de Acondicionamiento: OC + 7 dígitos (OC0000001).
export function formatOC(n: number) {
  return `OC${String(n).padStart(7, '0')}`;
}

export function useOrdenAcondicionamientoNextNumber() {
  return useQuery({
    queryKey: ['conditioning-orders', 'next-number'],
    queryFn: async () =>
      (await api.get<{ next: number }>('/conditioning-orders/next-number')).data,
  });
}

/** Órdenes de traslado cerradas (finalizadas), de la más reciente a la más antigua. */
export function useOrdenesTrasladoCerradas() {
  return useQuery({
    queryKey: ['transfer-orders', 'cerradas'],
    queryFn: async () =>
      (
        await api.get<{ data: OrdenTraslado[] }>('/transfer-orders', {
          params: { status: 'facturado', pageSize: 100 },
        })
      ).data.data,
  });
}

export function useCreateOrdenAcondicionamiento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      clienteId: string;
      transferOrderId: string;
      registrationDate: string;
      processDate: string;
      status: OrdenDespachoStatus;
    }) => (await api.post<OrdenAcondicionamiento>('/conditioning-orders', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conditioning-orders'] }),
  });
}

// ---- Rotulado Acondicionamiento ----

export function useOrdenesAcondicionamientoActivas() {
  return useQuery({
    queryKey: ['conditioning-orders', 'activas'],
    queryFn: async () =>
      (
        await api.get<{ data: OrdenAcondicionamiento[] }>('/conditioning-orders', {
          params: { status: 'activo', pageSize: 100 },
        })
      ).data.data,
    refetchInterval: 10000,
  });
}

export interface ResumenAcondicionamiento {
  ocNumber: number;
  otNumber: number;
  activa: boolean;
  sacrificio: string | null;
  recibido: { productoCodigo: string; productoNombre: string; empaques: number; unds: number; netoKg: number }[];
  productos: { productoCodigo: string; productoNombre: string; unds: number; netoKg: number }[];
  recibidoKg: number;
  procesadoKg: number;
  mermaKg: number;
  mermaPct: number;
}

export function useResumenAcondicionamiento(ocId: string) {
  return useQuery({
    queryKey: ['conditioning-orders', ocId, 'resumen'],
    queryFn: async () =>
      (await api.get<ResumenAcondicionamiento>(`/conditioning-orders/${ocId}/resumen`)).data,
  });
}

export interface EtiquetaAcond {
  id: string;
  pieza: number;
  codigo: string;
  productId: string;
  productoCodigo: string;
  productoNombre: string;
  tiendaId: string;
  tiendaCodigo: string;
  tiendaNombre: string;
  taraKg: number;
  brutoKg: number;
  netoKg: number;
  empaque: string;
  conservacion: string;
  temperatura: string;
  fechaSacrificio: string;
  fechaEmpaque: string;
  fechaVencimiento: string | null;
  ref: string | null;
  procesadoPara: string | null;
  impresa: boolean;
  estacion: string | null;
  bodega: string | null;
  usuario: string;
  createdAt: string;
}

export interface CrearEtiquetaAcondInput {
  productId: string;
  tiendaId: string;
  bodegaId?: string;
  taraKg: number;
  brutoKg: number;
  netoKg: number;
  empaque: string;
  conservacion: string;
  temperatura: string;
  fechaEmpaque: string;
  fechaVencimiento?: string;
  ref?: string;
  procesadoPara?: string;
  impresa: boolean;
  estacion?: string;
}

export function useEtiquetasAcond(ocId: string, productId?: string) {
  return useQuery({
    queryKey: ['conditioning-orders', ocId, 'etiquetas', productId ?? 'todas'],
    queryFn: async () =>
      (
        await api.get<EtiquetaAcond[]>(`/conditioning-orders/${ocId}/etiquetas`, {
          params: productId ? { productId } : {},
        })
      ).data,
  });
}

export function useCrearEtiquetaAcond(ocId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CrearEtiquetaAcondInput) =>
      (await api.post<EtiquetaAcond>(`/conditioning-orders/${ocId}/etiquetas`, input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conditioning-orders', ocId] }),
  });
}

export function useBorrarEtiquetaAcond(ocId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (etiquetaId: string) =>
      (await api.delete(`/conditioning-orders/etiquetas/${etiquetaId}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conditioning-orders', ocId] }),
  });
}

export function useCerrarAcondicionamiento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ocId: string) => (await api.patch(`/conditioning-orders/${ocId}/cerrar`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conditioning-orders'] }),
  });
}

export interface OrigenAcond {
  codigo: string;
  tipo: 'pieza' | 'canastilla';
  productoCodigo: string;
  productoNombre: string;
  unds: number;
  netoKg: number;
  opNumber: number | null;
  sacrificio: string | null;
}

export interface EtiquetaAcondEncontrada extends EtiquetaAcond {
  ocNumber: number;
  otNumber: number;
  cliente: string;
  clienteNit: string | null;
  origen: OrigenAcond[];
}

export async function buscarEtiquetaAcond(codigo: string) {
  return (
    await api.get<EtiquetaAcondEncontrada>('/conditioning-orders/rotulado/etiqueta', {
      params: { codigo },
    })
  ).data;
}
