import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api } from '@/lib/api';

export type DispatchOrderStatus = 'activo' | 'inactivo' | 'facturado';

export interface Client {
  id: string;
  nit: string;
  name: string;
  sede: string;
}

export interface DispatchOrder {
  id: string;
  odNumber: number;
  registrationDate: string;
  processDate: string;
  status: DispatchOrderStatus;
  type: string;
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

export interface CreateDispatchOrderInput {
  clientId: string;
  registrationDate: string;
  processDate: string;
  status: DispatchOrderStatus;
}

export function useClients() {
  return useQuery({
    queryKey: ['clients'],
    queryFn: async () => (await api.get<Client[]>('/clients')).data,
  });
}

export function useNextOdNumber() {
  return useQuery({
    queryKey: ['dispatch-orders', 'next-number'],
    queryFn: async () =>
      (await api.get<{ next: number }>('/dispatch-orders/next-number')).data,
  });
}

export function useDispatchOrders(params: {
  page: number;
  pageSize: number;
  status?: DispatchOrderStatus;
}) {
  return useQuery({
    queryKey: ['dispatch-orders', params],
    queryFn: async () =>
      (
        await api.get<Paginated<DispatchOrder>>('/dispatch-orders', {
          params,
        })
      ).data,
  });
}

export function useCreateDispatchOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateDispatchOrderInput) =>
      (await api.post<DispatchOrder>('/dispatch-orders', input)).data,
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['dispatch-orders'] }),
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

export const orderTypeLabel = 'Despacho de M.P a Proceso';
