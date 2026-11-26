import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ItemDespacho } from '../canal-fria/api';
import type { EtiquetaPorTrasladar, ItemTraslado } from './orden-traslado-api';
import type { OrdenDespachoStatus } from './orden-despacho-api';

export type TipoDespachoCanales = 'caliente' | 'frio' | 'posta';

export const TIPOS_DESPACHO_CANALES: { value: TipoDespachoCanales; label: string }[] = [
  { value: 'caliente', label: 'Despacho caliente' },
  { value: 'frio', label: 'Despacho frío' },
  { value: 'posta', label: 'Despacho posta' },
];

export interface OrdenDespachoCanales {
  id: string;
  dcNumber: number;
  tipo: TipoDespachoCanales;
  registrationDate: string;
  processDate: string;
  status: OrdenDespachoStatus;
  cliente: { id: string; nit: string | null; concepto: string };
}

// Consecutivo de Despacho de Canales: DC + 7 dígitos (DC0000001), común a caliente y frío.
export function formatDC(n: number) {
  return `DC${n}`;
}

export function useDespachoCanalesNextNumber() {
  return useQuery({
    queryKey: ['canal-dispatch-orders', 'next-number'],
    queryFn: async () =>
      (await api.get<{ next: number }>('/canal-dispatch-orders/next-number')).data,
  });
}

/** Órdenes activas de un tipo, para los módulos de logística (caliente o frío). */
export function useDespachosCanalesActivos(tipo: TipoDespachoCanales, status: 'activo' | 'facturado' = 'activo') {
  return useQuery({
    queryKey: ['canal-dispatch-orders', 'activas', tipo, status],
    queryFn: async () =>
      (
        await api.get<{ data: OrdenDespachoCanales[] }>('/canal-dispatch-orders', {
          params: { tipo, status, pageSize: 100 },
        })
      ).data.data,
    refetchInterval: 10000,
  });
}

export function useCreateDespachoCanales() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      tipo: TipoDespachoCanales;
      clienteId: string;
      registrationDate: string;
      processDate: string;
      status: OrdenDespachoStatus;
    }) => (await api.post<OrdenDespachoCanales>('/canal-dispatch-orders', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['canal-dispatch-orders'] }),
  });
}

// ---- Registro: canales despachadas en la orden DC (mismo formato que Canal Fría) ----

export function useItemsDespachoCanales(dcId: string | null) {
  return useQuery({
    queryKey: ['canal-dispatch-orders', 'items', dcId],
    enabled: !!dcId,
    queryFn: async () =>
      (await api.get<ItemDespacho[]>(`/canal-dispatch-orders/${dcId}/items`)).data,
  });
}

export function useAgregarItemDespachoCanales(dcId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (barcode: string) =>
      (await api.post<ItemDespacho>(`/canal-dispatch-orders/${dcId}/items`, { barcode })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['canal-dispatch-orders', 'items', dcId] });
      qc.invalidateQueries({ queryKey: ['inventarios'] });
    },
  });
}

export function usePesarItemDespachoCanales(dcId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, despachoKg }: { itemId: string; despachoKg: number }) =>
      (await api.patch<ItemDespacho>(`/canal-dispatch-orders/items/${itemId}`, { despachoKg })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['canal-dispatch-orders', 'items', dcId] }),
  });
}

export interface CerrarDespachoInput {
  dcId: string;
  puntoEnvioId?: string;
  guiaTransporteId?: string;
  nuevaGuia?: {
    fecha?: string;
    tipoVehiculo: string;
    placa: string;
    conductor: string;
    cedula?: string;
    observacion?: string;
  };
  /** Clave del supervisor si la orden tiene pre-órdenes sin alistar al 100 %. */
  pin?: string;
  /** Posta al cliente con tiendas: camiones (guías) y en cuál va cada tienda (índice en `guias`). */
  guias?: { guiaTransporteId?: string; nuevaGuia?: CerrarDespachoInput['nuevaGuia'] }[];
  remisiones?: { pickingId: string; guia: number }[];
}

/** Cierra la orden DC con su destino (punto de envío o el cliente) y su guía de transporte. */
export function useCerrarDespachoCanales() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ dcId, ...body }: CerrarDespachoInput) =>
      (
        await api.patch<{ ok: boolean; guiaTransporteId: string; guiaTransporteIds: string[]; remisiones: number }>(
          `/canal-dispatch-orders/${dcId}/cerrar`,
          body,
        )
      ).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['canal-dispatch-orders'] });
      qc.invalidateQueries({ queryKey: ['inventarios'] });
      qc.invalidateQueries({ queryKey: ['guias-transporte'] });
    },
  });
}

export function useQuitarItemDespachoCanales(dcId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (itemId: string) =>
      (await api.delete(`/canal-dispatch-orders/items/${itemId}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['canal-dispatch-orders', 'items', dcId] });
      qc.invalidateQueries({ queryKey: ['inventarios'] });
    },
  });
}

// ---- Despacho Posta: productos rotulados (misma pantalla que Traslado) ----

export function useDespachosPostaActivos() {
  return useDespachosCanalesActivos('posta');
}

export async function buscarProductoPosta(dcId: string, codigo: string, pin?: string) {
  return (
    await api.get<EtiquetaPorTrasladar>(`/canal-dispatch-orders/${dcId}/producto`, { params: { codigo, pin } })
  ).data;
}

export function useProductosPosta(dcId: string | null) {
  return useQuery({
    queryKey: ['canal-dispatch-orders', dcId, 'productos'],
    queryFn: async () => (await api.get<ItemTraslado[]>(`/canal-dispatch-orders/${dcId}/productos`)).data,
    enabled: !!dcId,
  });
}

export function useRegistrarProductoPosta(dcId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { codigo: string; pesoKg: number; taraKg: number; pin?: string }) =>
      (await api.post<ItemTraslado>(`/canal-dispatch-orders/${dcId}/productos`, input)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['canal-dispatch-orders', dcId, 'productos'] });
      qc.invalidateQueries({ queryKey: ['inventarios'] });
    },
  });
}

export function useQuitarProductoPosta(dcId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (itemId: string) =>
      (await api.delete(`/canal-dispatch-orders/productos/${itemId}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['canal-dispatch-orders', dcId, 'productos'] });
      qc.invalidateQueries({ queryKey: ['inventarios'] });
    },
  });
}
