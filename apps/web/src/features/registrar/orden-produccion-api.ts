import { useEffect } from 'react';
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

/** Órdenes de producción activas (opcionalmente de una fecha de proceso), de la más reciente a la más antigua. */
export function useOrdenesProduccionActivas(fecha?: string) {
  return useQuery({
    queryKey: ['production-orders', 'activas', fecha ?? 'todas'],
    queryFn: async () =>
      (
        await api.get<{ data: OrdenProduccion[] }>('/production-orders', {
          params: { status: 'activo', pageSize: 100, ...(fecha ? { fecha } : {}) },
        })
      ).data.data,
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

// ---- Preparar orden: canales por tienda ----

export interface PreparacionOrden {
  totalCanales: number;
  asignadas: number;
  disponibles: number;
  tiendas: { id: string; tiendaId: string; codigo: string; nombre: string; cantidad: number }[];
}

export function usePreparacion(ordenId: string) {
  return useQuery({
    queryKey: ['production-orders', ordenId, 'preparacion'],
    queryFn: async () =>
      (await api.get<PreparacionOrden>(`/production-orders/${ordenId}/preparacion`)).data,
  });
}

export function useAsignarTienda(ordenId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { tiendaId: string; cantidad: number }) =>
      (await api.post<PreparacionOrden>(`/production-orders/${ordenId}/preparacion`, input)).data,
    onSuccess: (data) => qc.setQueryData(['production-orders', ordenId, 'preparacion'], data),
  });
}

export function useQuitarTienda(ordenId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (filaId: string) =>
      (await api.delete<PreparacionOrden>(`/production-orders/preparacion/${filaId}`)).data,
    onSuccess: (data) => qc.setQueryData(['production-orders', ordenId, 'preparacion'], data),
  });
}

// ---- Etiquetas de Rotulado Desposte guardadas en la orden ----

export interface EtiquetaRotulado {
  id: string;
  pieza: number;
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
  sobrante: boolean;
  tiendaId: string;
  tiendaCodigo: string;
  tiendaNombre: string;
  canastillaNumero: number | null;
  canastillaCerrada: boolean;
  createdAt: string;
}

export interface GuardarEtiquetaInput {
  productId: string;
  tiendaId: string;
  bodegaId?: string;
  pieza: number;
  taraKg: number;
  brutoKg: number;
  netoKg: number;
  empaque: 'A GRANEL' | 'AL VACIO';
  conservacion: 'refrigerado' | 'congelado';
  temperatura: string;
  fechaSacrificio: string;
  fechaEmpaque: string;
  fechaVencimiento?: string;
  ref?: string;
  procesadoPara?: string;
  impresa: boolean;
  sobrante?: boolean;
}

export interface CanastillaRotulado {
  id: string;
  numero: number;
  tiendaId: string;
  tiendaCodigo: string;
  tiendaNombre: string;
  unds: number;
  sobrantes: number;
  netoKg: number;
  /** Tara con la que se pesaron sus piezas (la misma para toda la canastilla). */
  taraPiezas: number | null;
  taraKg: number | null;
  brutoKg: number | null;
  cerrada: boolean;
  cerradaAt: string | null;
  datos: {
    empaque: string;
    conservacion: string;
    temperatura: string;
    fechaSacrificio: string;
    fechaEmpaque: string;
    fechaVencimiento: string | null;
    ref: string | null;
  } | null;
}

export interface EstadoRotulado {
  activa: boolean;
  piezasPorCanal: number;
  undsPorCaja: number;
  /** Tope de la canastilla actual: Unds x caja o lo que le falta a la tienda (lo menor). */
  capacidadCanastilla: number;
  tiendas: {
    tiendaId: string;
    codigo: string;
    nombre: string;
    canales: number;
    requeridas: number;
    etiquetadas: number;
    sobrantes: number;
  }[];
  siguienteTiendaId: string | null;
  canastilla: CanastillaRotulado | null;
  ultimaCanastilla: CanastillaRotulado | null;
}

const rotuladoKey = (ordenId: string, productId: string) =>
  ['production-orders', ordenId, 'rotulado', productId];

export function useEstadoRotulado(ordenId: string, productId: string) {
  return useQuery({
    queryKey: [...rotuladoKey(ordenId, productId), 'estado'],
    queryFn: async () =>
      (
        await api.get<EstadoRotulado>(`/production-orders/${ordenId}/rotulado/estado`, {
          params: { productId },
        })
      ).data,
    refetchInterval: 10000,
  });
}

export interface AvanceProducto {
  productId: string;
  iniciado: boolean;
  completo: boolean;
  tiendaActual: { codigo: string; nombre: string } | null;
  estaciones: { estacionId: string; estacion: string; usuario: string }[];
}

export function useAvanceRotulado(ordenId: string) {
  return useQuery({
    queryKey: ['production-orders', ordenId, 'rotulado', 'avance'],
    queryFn: async () =>
      (await api.get<AvanceProducto[]>(`/production-orders/${ordenId}/rotulado/avance`)).data,
    refetchInterval: 5000,
  });
}

/** Avisa al servidor que esta estación tiene abierto el producto (latido cada 15 s). */
export function usePresenciaRotulado(
  ordenId: string,
  productId: string,
  estacion: { id: string; nombre: string; usuario: string },
) {
  const { id, nombre, usuario } = estacion;
  useEffect(() => {
    if (!id) return;
    const latido = () =>
      api
        .post(`/production-orders/${ordenId}/rotulado/presencia`, {
          productId,
          estacionId: id,
          estacion: nombre,
          usuario,
        })
        .catch(() => undefined);
    void latido();
    const t = setInterval(latido, 15000);
    return () => {
      clearInterval(t);
      void api
        .delete(`/production-orders/${ordenId}/rotulado/presencia/${encodeURIComponent(id)}`)
        .catch(() => undefined);
    };
  }, [ordenId, productId, id, nombre, usuario]);
}

export function useEtiquetasRotulado(ordenId: string, productId: string) {
  return useQuery({
    queryKey: [...rotuladoKey(ordenId, productId), 'etiquetas'],
    queryFn: async () =>
      (
        await api.get<EtiquetaRotulado[]>(`/production-orders/${ordenId}/etiquetas`, {
          params: { productId },
        })
      ).data,
  });
}

export function useGuardarEtiqueta(ordenId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: GuardarEtiquetaInput) =>
      (await api.post<EtiquetaRotulado>(`/production-orders/${ordenId}/etiquetas`, input)).data,
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['production-orders', ordenId, 'rotulado'] }),
  });
}

export function useBorrarEtiqueta(ordenId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ etiquetaId, reabrir }: { etiquetaId: string; reabrir?: boolean }) =>
      (
        await api.delete(`/production-orders/etiquetas/${etiquetaId}`, {
          params: reabrir ? { reabrir: true } : undefined,
        })
      ).data,
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['production-orders', ordenId, 'rotulado'] }),
  });
}

export function useCerrarCanastilla(ordenId: string, productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { canastillaId: string; taraKg: number }) =>
      (
        await api.post<CanastillaRotulado>(
          `/production-orders/canastillas/${input.canastillaId}/cerrar`,
          { taraKg: input.taraKg },
        )
      ).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: rotuladoKey(ordenId, productId) }),
  });
}
