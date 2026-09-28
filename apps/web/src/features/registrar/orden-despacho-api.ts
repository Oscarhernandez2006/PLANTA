import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type OrdenDespachoStatus = 'activo' | 'inactivo' | 'facturado';

export interface OrdenDespacho {
  id: string;
  odNumber: number;
  registrationDate: string;
  processDate: string;
  status: OrdenDespachoStatus;
  cliente: { id: string; nit: string | null; concepto: string };
}

export interface ClienteOpcion {
  id: string;
  concepto: string;
  nit: string | null;
}

// Consecutivo de Orden de Despacho: OD + 7 dígitos (OD0000001).
export function formatOD(n: number) {
  return `OD${String(n).padStart(7, '0')}`;
}

/** Todas las órdenes de despacho son de este tipo. */
export const TIPO_ORDEN_DESPACHO = 'DESPACHO DE M.P A PROCESO';

/** Órdenes de despacho activas, de la más reciente a la más antigua. */
export function useOrdenesDespachoActivas() {
  return useQuery({
    queryKey: ['dispatch-orders', 'activas'],
    queryFn: async () =>
      (
        await api.get<{ data: OrdenDespacho[] }>('/dispatch-orders', {
          params: { status: 'activo', pageSize: 100 },
        })
      ).data.data,
    refetchInterval: 10000,
  });
}

export function useOrdenDespachoNextNumber() {
  return useQuery({
    queryKey: ['dispatch-orders', 'next-number'],
    queryFn: async () =>
      (await api.get<{ next: number }>('/dispatch-orders/next-number')).data,
  });
}

/** Clientes activos del módulo Clientes. */
export function useClientesActivos() {
  return useQuery({
    queryKey: ['clientes', 'activos'],
    queryFn: async () => (await api.get<ClienteOpcion[]>('/clientes')).data,
  });
}

export function useCreateOrdenDespacho() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      clienteId: string;
      registrationDate: string;
      processDate: string;
      status: OrdenDespachoStatus;
    }) => (await api.post<OrdenDespacho>('/dispatch-orders', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dispatch-orders'] }),
  });
}
