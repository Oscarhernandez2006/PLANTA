import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface Device {
  id: string;
  mac: string;
  name: string;
  description: string | null;
  hostname: string | null;
  active: boolean;
  lastSeenAt: string | null;
  createdAt: string;
}

export interface CreateDeviceInput {
  mac: string;
  name: string;
  description?: string;
  active?: boolean;
}

export function useDevices() {
  return useQuery({
    queryKey: ['devices'],
    queryFn: async () => (await api.get<Device[]>('/devices')).data,
  });
}

export function useCreateDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateDeviceInput) =>
      (await api.post<Device>('/devices', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['devices'] }),
  });
}

export function useUpdateDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...patch
    }: {
      id: string;
      name?: string;
      description?: string;
      active?: boolean;
    }) => (await api.patch<Device>(`/devices/${id}`, patch)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['devices'] }),
  });
}

export function useDeleteDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/devices/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['devices'] }),
  });
}
