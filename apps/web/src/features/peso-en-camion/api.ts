import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface Procedencia {
  id: string;
  code: number;  rspp: string | null;
  concepto: string;
}

export function useProcedencias(search: string) {
  return useQuery({
    queryKey: ['procedencias', search],
    queryFn: async () =>
      (
        await api.get<Procedencia[]>('/procedencias', {
          params: search ? { search } : {},
        })
      ).data,
  });
}

export function useCreateProcedencia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { concepto: string; rspp?: string }) =>
      (await api.post<Procedencia>('/procedencias', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['procedencias'] }),
  });
}

export interface Proveedor {
  id: string;
  code: number;
  concepto: string;
}

export function useProveedores(search: string) {
  return useQuery({
    queryKey: ['proveedores', search],
    queryFn: async () =>
      (
        await api.get<Proveedor[]>('/proveedores', {
          params: search ? { search } : {},
        })
      ).data,
  });
}

export function useProveedorNextCode(enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: ['proveedores', 'next-code'],
    queryFn: async () =>
      (await api.get<{ next: number }>('/proveedores/next-code')).data,
  });
}

export function useCreateProveedor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { concepto: string }) =>
      (await api.post<Proveedor>('/proveedores', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['proveedores'] }),
  });
}

export interface Cliente {
  id: string;
  code: number;
  concepto: string;
}

export function useClientes(search: string) {
  return useQuery({
    queryKey: ['clientes', search],
    queryFn: async () =>
      (
        await api.get<Cliente[]>('/clientes', {
          params: search ? { search } : {},
        })
      ).data,
  });
}

export function useClienteNextCode(enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: ['clientes', 'next-code'],
    queryFn: async () =>
      (await api.get<{ next: number }>('/clientes/next-code')).data,
  });
}

export function useCreateCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { concepto: string }) =>
      (await api.post<Cliente>('/clientes', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clientes'] }),
  });
}

export interface Conductor {
  id: string;
  code: number;
  concepto: string;
}

export function useConductores(search: string) {
  return useQuery({
    queryKey: ['conductores', search],
    queryFn: async () =>
      (
        await api.get<Conductor[]>('/conductores', {
          params: search ? { search } : {},
        })
      ).data,
  });
}

export function useConductorNextCode(enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: ['conductores', 'next-code'],
    queryFn: async () =>
      (await api.get<{ next: number }>('/conductores/next-code')).data,
  });
}

export function useCreateConductor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { concepto: string }) =>
      (await api.post<Conductor>('/conductores', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conductores'] }),
  });
}

/** Formatea el código a 6 dígitos con ceros a la izquierda. */
export function formatProcedenciaCode(code: number) {
  return String(code).padStart(6, '0');
}

// ======================= GUÍA DE PESO EN CAMIÓN ==========================

export interface PesoCamionGuia {
  id: string;
  reference: number;
  date: string;
  guia: string | null;
  procedencia: string | null;
  proveedor: string | null;
  cliente: string | null;
  placa: string | null;
  conductor: string | null;
  observaciones: string | null;
  cantidad: number | null;
  entrada: number | null;
  salida: number | null;
  status: 'abierta' | 'cerrada';
}

export interface SavePesoCamionInput {
  date?: string;
  guia?: string;
  procedencia?: string;
  proveedor?: string;
  cliente?: string;
  placa?: string;
  conductor?: string;
  observaciones?: string;
  cantidad?: number;
  entrada?: number;
  salida?: number;
}

export function usePesoCamionAbiertas() {
  return useQuery({
    queryKey: ['peso-camion', 'abiertas'],
    queryFn: async () =>
      (
        await api.get<PesoCamionGuia[]>('/peso-camion', {
          params: { status: 'abierta' },
        })
      ).data,
  });
}

export function usePesoCamionNextReference(date: string, enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: ['peso-camion', 'next-reference', date],
    queryFn: async () =>
      (
        await api.get<{ next: number }>('/peso-camion/next-reference', {
          params: { date },
        })
      ).data,
  });
}

export function useCreatePesoCamion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SavePesoCamionInput) =>
      (await api.post<PesoCamionGuia>('/peso-camion', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['peso-camion'] }),
  });
}

export function useUpdatePesoCamion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: string;
      input: SavePesoCamionInput;
    }) => (await api.patch<PesoCamionGuia>(`/peso-camion/${id}`, input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['peso-camion'] }),
  });
}

export function useClosePesoCamion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.patch<PesoCamionGuia>(`/peso-camion/${id}/close`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['peso-camion'] }),
  });
}
