import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface ClienteDatos {
  nit: string | null;
  direccion: string | null;
  telefono: string | null;
  ciudad: string | null;
  contacto: string | null;
  correo: string | null;
  celular: string | null;
}

export interface ClienteCompleto extends ClienteDatos {
  id: string;
  code: number;
  concepto: string;
  active: boolean;
}

export type ClienteInput = { concepto: string } & {
  [K in keyof ClienteDatos]?: string;
};

export function useClientesAdmin() {
  return useQuery({
    queryKey: ['clientes', 'admin'],
    queryFn: async () =>
      (await api.get<ClienteCompleto[]>('/clientes', { params: { todos: true } })).data,
  });
}

export function useNextClienteCode() {
  return useQuery({
    queryKey: ['clientes', 'next-code'],
    queryFn: async () =>
      (await api.get<{ next: number }>('/clientes/next-code')).data,
  });
}

export function useCrearCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ClienteInput) =>
      (await api.post<ClienteCompleto>('/clientes', { ...input, estricto: true })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clientes'] }),
  });
}

export function useActualizarCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: Partial<ClienteInput> & { id: string; active?: boolean }) =>
      (await api.patch<ClienteCompleto>(`/clientes/${id}`, input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clientes'] }),
  });
}

// ---- Bodegas internas del cliente ----

export interface Bodega {
  id: string;
  code: number;
  nombre: string;
  active: boolean;
}

export function useBodegas(clienteId: string) {
  return useQuery({
    queryKey: ['clientes', clienteId, 'bodegas'],
    queryFn: async () => (await api.get<Bodega[]>(`/clientes/${clienteId}/bodegas`)).data,
  });
}

export function useNextBodegaCode() {
  return useQuery({
    queryKey: ['clientes', 'bodegas', 'next-code'],
    queryFn: async () => (await api.get<{ next: number }>('/clientes/bodegas/next-code')).data,
  });
}

export function useCrearBodega(clienteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { nombre: string }) =>
      (await api.post<Bodega>(`/clientes/${clienteId}/bodegas`, input)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clientes', clienteId, 'bodegas'] });
      qc.invalidateQueries({ queryKey: ['clientes', 'bodegas'] });
    },
  });
}

export function useActualizarBodega(clienteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string; nombre?: string; active?: boolean }) =>
      (await api.patch<Bodega>(`/clientes/bodegas/${id}`, input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clientes', clienteId, 'bodegas'] }),
  });
}

// ---- Tiendas del cliente ----

export interface Tienda {
  id: string;
  codigo: string;
  nombre: string;
  direccion: string | null;
  ciudad: string | null;
  active: boolean;
}

export interface TiendaInput {
  nombre: string;
  direccion: string;
  ciudad: string;
}

export function useTiendas(clienteId: string) {
  return useQuery({
    queryKey: ['clientes', clienteId, 'tiendas'],
    queryFn: async () => (await api.get<Tienda[]>(`/clientes/${clienteId}/tiendas`)).data,
  });
}

export function useNextTiendaCode(clienteId: string) {
  return useQuery({
    queryKey: ['clientes', clienteId, 'tiendas', 'next-code'],
    queryFn: async () =>
      (await api.get<{ next: string }>(`/clientes/${clienteId}/tiendas/next-code`)).data,
  });
}

export function useCrearTienda(clienteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: TiendaInput) =>
      (await api.post<Tienda>(`/clientes/${clienteId}/tiendas`, input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clientes', clienteId, 'tiendas'] }),
  });
}

export function useActualizarTienda(clienteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<TiendaInput> & { id: string; active?: boolean }) =>
      (await api.patch<Tienda>(`/clientes/tiendas/${id}`, input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clientes', clienteId, 'tiendas'] }),
  });
}
