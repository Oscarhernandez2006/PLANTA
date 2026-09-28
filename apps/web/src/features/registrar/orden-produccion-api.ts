import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { OrdenDespachoStatus } from './orden-despacho-api';

export interface OrdenProduccion {
  id: string;
  opNumber: number;
  registrationDate: string;
  processDate: string;
  status: OrdenDespachoStatus;
  cliente: { id: string; nit: string | null; concepto: string };
  dispatchOrder: { id: string; odNumber: number };
}

// Consecutivo de Orden de Producción: OP + 7 dígitos (OP0000001).
export function formatOP(n: number) {
  return `OP${String(n).padStart(7, '0')}`;
}

export function useOrdenProduccionNextNumber() {
  return useQuery({
    queryKey: ['production-orders', 'next-number'],
    queryFn: async () =>
      (await api.get<{ next: number }>('/production-orders/next-number')).data,
  });
}

/** Órdenes de producción activas con fecha de proceso `fecha`, de la más reciente a la más antigua. */
export function useOrdenesProduccionActivas(fecha: string) {
  return useQuery({
    queryKey: ['production-orders', 'activas', fecha],
    queryFn: async () =>
      (
        await api.get<{ data: OrdenProduccion[] }>('/production-orders', {
          params: { status: 'activo', fecha, pageSize: 100 },
        })
      ).data.data,
    enabled: !!fecha,
    refetchInterval: 10000,
  });
}

export function useCreateOrdenProduccion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      clienteId: string;
      dispatchOrderId: string;
      registrationDate: string;
      processDate: string;
      status: OrdenDespachoStatus;
    }) => (await api.post<OrdenProduccion>('/production-orders', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['production-orders'] }),
  });
}
