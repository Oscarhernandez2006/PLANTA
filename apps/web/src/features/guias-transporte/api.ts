import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type TipoDespacho = 'caliente' | 'frio' | 'posta';

export const formatGM = (n: number) => `GM${n}`;

export interface GuiaDespacho {
  id: string;
  dcNumber: number;
  tipo: TipoDespacho;
  status: string;
  cliente: string;
  puntoEnvio: string | null;
  /** Tiendas de esta orden que van en este camión (remisiones por tienda). */
  tiendas: { pickingId: string; nombre: string }[];
}

export interface GuiaTransporte {
  id: string;
  numero: number;
  fecha: string;
  tipoVehiculo: string;
  placa: string;
  conductor: string;
  cedula: string | null;
  observacion: string | null;
  createdAt: string;
  despachos: GuiaDespacho[];
}

export interface GuiaInput {
  fecha?: string;
  tipoVehiculo: string;
  placa: string;
  conductor: string;
  cedula?: string;
  observacion?: string;
}

export interface FiltroGuias {
  buscar?: string;
  desde?: string;
  hasta?: string;
}

const limpiar = (f: FiltroGuias) =>
  Object.fromEntries(Object.entries(f).filter(([, v]) => v && String(v).trim()));

export function useGuiasTransporte(filtro: FiltroGuias, enabled = true) {
  return useQuery({
    queryKey: ['guias-transporte', filtro],
    queryFn: async () =>
      (await api.get<GuiaTransporte[]>('/guias-transporte', { params: limpiar(filtro) })).data,
    enabled,
  });
}

export function useNextGuiaNumber(enabled = true) {
  return useQuery({
    queryKey: ['guias-transporte', 'next-number'],
    queryFn: async () => (await api.get<{ next: number }>('/guias-transporte/next-number')).data,
    enabled,
  });
}

export function useCrearGuia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: GuiaInput) =>
      (await api.post<GuiaTransporte>('/guias-transporte', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['guias-transporte'] }),
  });
}

export function useActualizarGuia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<GuiaInput> & { id: string }) =>
      (await api.patch<GuiaTransporte>(`/guias-transporte/${id}`, input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['guias-transporte'] }),
  });
}

// ---- Informes de despacho ----

export interface DespachoCerrado {
  id: string;
  dcNumber: number;
  tipo: TipoDespacho;
  processDate: string;
  cerradaAt: string;
  cliente: string;
  clienteNit: string | null;
  puntoEnvio: string | null;
  municipio: string | null;
  guia: { numero: number; placa: string; conductor: string } | null;
  /** Guías (camiones) de la orden: varias si sus remisiones por tienda van en camiones distintos. */
  guias: { numero: number; placa: string; conductor: string }[];
  remisiones: number;
}

export function useDespachosCerrados(filtro: FiltroGuias) {
  return useQuery({
    // Misma raíz que los listados de Informes para que "Actualizar" lo refresque.
    queryKey: ['informes', 'despachos', 'listado-paginado', filtro],
    queryFn: async () =>
      (await api.get<DespachoCerrado[]>('/guias-transporte/despachos', { params: limpiar(filtro) }))
        .data,
  });
}

// ---- Remisión (datos del PDF) ----

export interface Remision {
  id: string;
  /** Pre-orden (tienda) de la remisión; null = remisión única de la orden. */
  pickingId: string | null;
  /** DC3-GM1 o DC3-GM1-T01. */
  codigo: string;
  dcNumber: number;
  tipo: TipoDespacho;
  status: string;
  processDate: string | null;
  cerradaAt: string;
  planta: { razonSocial: string; invima: string | null };
  cliente: { razonSocial: string; nit: string | null };
  destino: {
    puntoEnvio: boolean;
    razonSocial: string;
    nit: string | null;
    telefono: string | null;
    direccion: string | null;
    municipio: string | null;
    departamento: string | null;
    tienda: { codigo: string | null; nombre: string | null; ocNumero: string | null } | null;
  };
  guia: {
    numero: number;
    fecha: string | null;
    tipoVehiculo: string;
    placa: string;
    conductor: string;
    cedula: string | null;
    observacion: string | null;
  } | null;
  despachador: string;
  fechasSacrificio: string[];
  items: { producto: string; lote: string; unds: number; kg: number; fechaSacrificio: string | null }[];
  /** Un renglón por código de barras pistoleado (vista interna). */
  detalle: {
    codigo: string;
    tipoCodigo: 'CANAL' | 'PIEZA' | 'CANASTILLA';
    producto: string;
    lote: string;
    unds: number;
    kg: number;
    fechaSacrificio: string | null;
  }[];
}

/** Cliente: productos consolidados por lote. Interna: código de barras por código de barras. */
export type VistaRemision = 'cliente' | 'interna';

export async function obtenerRemision(dcId: string, pickingId?: string | null) {
  return (
    await api.get<Remision>(`/canal-dispatch-orders/${dcId}/remision`, {
      params: pickingId ? { pickingId } : undefined,
    })
  ).data;
}

/** Trae la remisión de la orden (o de una tienda) y descarga la guía de transporte en PDF. */
export async function descargarGuiaDespacho(
  dcId: string,
  operario: string,
  vista: VistaRemision = 'cliente',
  pickingId?: string | null,
) {
  const [remision, { descargarGuiaPdf }] = await Promise.all([
    obtenerRemision(dcId, pickingId),
    import('./guia-transporte-pdf'),
  ]);
  await descargarGuiaPdf(remision, operario, vista);
}

/** URL (blob) del PDF de la remisión para un visor; liberar con `URL.revokeObjectURL`. */
export async function urlGuiaDespacho(
  dcId: string,
  operario: string,
  vista: VistaRemision = 'cliente',
  pickingId?: string | null,
) {
  const [remision, { urlGuiaPdf }] = await Promise.all([
    obtenerRemision(dcId, pickingId),
    import('./guia-transporte-pdf'),
  ]);
  return urlGuiaPdf(remision, operario, vista);
}

export interface RemisionResumen {
  pickingId: string | null;
  codigo: string;
  destino: string;
  tienda: { codigo: string | null; nombre: string | null } | null;
  ocNumero: string | null;
  guia: { numero: number; placa: string; conductor: string } | null;
  empaques: number | null;
  kg: number | null;
}

/** Remisiones de una orden cerrada (una, o una por tienda). */
export function useRemisiones(dcId: string | null) {
  return useQuery({
    queryKey: ['informes', 'despachos', 'remisiones', dcId],
    queryFn: async () =>
      (await api.get<RemisionResumen[]>(`/canal-dispatch-orders/${dcId}/remisiones`)).data,
    enabled: !!dcId,
  });
}

export interface TiendaRemision {
  pickingId: string;
  nombre: string;
  tiendaCodigo: string | null;
  tiendaNombre: string | null;
  ocNumero: string | null;
  empaques: number;
  kg: number;
}

/** Al cerrar un despacho posta al cliente: tiendas que llevan producto (una remisión por tienda). */
export function useTiendasRemision(dcId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['canal-dispatch-orders', dcId, 'tiendas-remision'],
    queryFn: async () =>
      (
        await api.get<{ porTienda: boolean; tiendas: TiendaRemision[]; sinTienda: number }>(
          `/canal-dispatch-orders/${dcId}/tiendas-remision`,
        )
      ).data,
    enabled,
  });
}
