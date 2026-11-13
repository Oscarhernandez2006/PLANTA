import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { api } from '@/lib/api';

export function mensajeError(err: unknown, porDefecto: string) {
  if (isAxiosError(err)) {
    const m = (err.response?.data as { message?: string | string[] } | undefined)?.message;
    if (Array.isArray(m)) return m.join(' ');
    if (m) return m;
  }
  return porDefecto;
}

// ---- Precios ----

export interface ListaPreciosResumen {
  id: string;
  nombre: string;
  vigenteDesde: string;
  observaciones: string | null;
  clienteId: string | null;
  cliente: string | null;
  productos: number;
  conPrecio: number;
  vigente: boolean;
  futura: boolean;
}

export interface PrecioProducto {
  productId: string;
  codigo: string;
  nombre: string;
  categoria: string | null;
  precioKg: number;
}

export interface ListaPrecios {
  id: string;
  nombre: string;
  vigenteDesde: string;
  observaciones: string | null;
  clienteId: string | null;
  cliente: string | null;
  precios: PrecioProducto[];
}

const KEY_PRECIOS = ['talleres', 'precios'];

export function useListasPrecios() {
  return useQuery({
    queryKey: [...KEY_PRECIOS, 'listas'],
    queryFn: async () => (await api.get<ListaPreciosResumen[]>('/talleres/precios/listas')).data,
  });
}

export function useListaPrecios(id: string | null) {
  return useQuery({
    queryKey: [...KEY_PRECIOS, 'lista', id],
    enabled: !!id,
    queryFn: async () => (await api.get<ListaPrecios>(`/talleres/precios/listas/${id}`)).data,
  });
}

export function useCrearListaPrecios() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { nombre: string; vigenteDesde: string; clienteId?: string; copiarDeId?: string; observaciones?: string }) =>
      (await api.post<ListaPrecios>('/talleres/precios/listas', body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY_PRECIOS }),
  });
}

export function useEditarListaPrecios() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string; nombre?: string; vigenteDesde?: string; observaciones?: string }) =>
      (await api.patch<ListaPrecios>(`/talleres/precios/listas/${id}`, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY_PRECIOS }),
  });
}

export function useEliminarListaPrecios() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/talleres/precios/listas/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY_PRECIOS }),
  });
}

export function useGuardarPrecios() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, precios }: { id: string; precios: { productId?: string; codigo?: string; precioKg: number }[] }) =>
      (await api.put<{ actualizados: number; noEncontrados: string[] }>(`/talleres/precios/listas/${id}/precios`, { precios })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY_PRECIOS }),
  });
}

// ---- Tarifas ----

export type TarifaBase = 'kg_frio' | 'kg_entrada' | 'kg' | 'kg_empacado' | 'unidad' | 'canal';
export const BASE_LABEL: Record<TarifaBase, string> = {
  kg_frio: 'Por kg frío',
  kg_entrada: 'Por kg de entrada',
  kg: 'Por kg',
  kg_empacado: 'Por kg empacado',
  unidad: 'Por unidad',
  canal: 'Por canal',
};

export const CATEGORIAS = [
  'desposte',
  'inyeccion',
  'porcionado',
  'empaque',
  'caja',
  'bolsa',
  'termoformado',
  'etiqueta',
  'servicio',
] as const;
export type CategoriaTarifa = (typeof CATEGORIAS)[number];
export const CATEGORIA_LABEL: Record<CategoriaTarifa, string> = {
  desposte: 'Desposte',
  inyeccion: 'Inyección',
  porcionado: 'Porcionado',
  empaque: 'Empaque',
  caja: 'Cajas',
  bolsa: 'Bolsas al vacío',
  termoformado: 'Termoformado',
  etiqueta: 'Etiquetas',
  servicio: 'Servicios',
};

interface VersionTarifa {
  id: string;
  valor: number;
  vigenteDesde: string;
  activo: boolean;
  base: TarifaBase;
  categoria: CategoriaTarifa;
}

export interface Tarifa {
  concepto: string;
  categoria: CategoriaTarifa;
  base: TarifaBase;
  valor: number;
  activo: boolean;
  vigenteDesde: string;
  origen: 'general' | 'cliente';
  general: VersionTarifa | null;
  cliente: VersionTarifa | null;
}

export interface HistorialTarifa {
  id: string;
  valor: number;
  base: TarifaBase;
  vigenteDesde: string;
  activo: boolean;
  creadoPor: string | null;
  createdAt: string;
}

const KEY_TARIFAS = ['talleres', 'tarifas'];

export function useTarifas(clienteId: string) {
  return useQuery({
    queryKey: [...KEY_TARIFAS, clienteId],
    queryFn: async () => (await api.get<Tarifa[]>('/talleres/tarifas', { params: { clienteId: clienteId || undefined } })).data,
  });
}

export function useHistorialTarifa(concepto: string | null, clienteId: string) {
  return useQuery({
    queryKey: [...KEY_TARIFAS, 'historial', concepto, clienteId],
    enabled: !!concepto,
    queryFn: async () =>
      (await api.get<HistorialTarifa[]>('/talleres/tarifas/historial', { params: { concepto, clienteId: clienteId || undefined } })).data,
  });
}

export function useCrearTarifa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      clienteId?: string;
      categoria: CategoriaTarifa;
      concepto: string;
      base: TarifaBase;
      valor: number;
      vigenteDesde: string;
    }) => (await api.post('/talleres/tarifas', body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY_TARIFAS }),
  });
}

export function useCambiarActivoTarifa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { clienteId?: string; concepto: string }) => (await api.post('/talleres/tarifas/activo', body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY_TARIFAS }),
  });
}

// ---- Reglas por corte ----

export interface ReglaCorte {
  productId: string;
  codigo: string;
  nombre: string;
  retoma: boolean;
  piking: boolean;
  congelacion: boolean;
  kgCongelados: number | null;
  origen: 'general' | 'cliente' | null;
}

export function useReglasCorte(clienteId: string) {
  return useQuery({
    queryKey: ['talleres', 'reglas', clienteId],
    queryFn: async () => (await api.get<ReglaCorte[]>('/talleres/reglas-corte', { params: { clienteId: clienteId || undefined } })).data,
  });
}

export function useGuardarReglas() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { clienteId?: string; reglas: Omit<ReglaCorte, 'codigo' | 'nombre' | 'origen'>[] }) =>
      (await api.put<ReglaCorte[]>('/talleres/reglas-corte', body)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['talleres', 'reglas'] });
      qc.invalidateQueries({ queryKey: ['talleres', 'desposte'] });
    },
  });
}

// ---- Servicios manuales ----

export interface ServicioManual {
  concepto: string;
  cantidad: number;
  valorUnitario: number | null;
}
export type RefServicios = { productionOrderId: string } | { transferOrderId: string };

export function useServicios(ref: RefServicios) {
  return useQuery({
    queryKey: ['talleres', 'servicios', ref],
    queryFn: async () => (await api.get<ServicioManual[]>('/talleres/servicios', { params: ref })).data,
  });
}

export function useGuardarServicios() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: RefServicios & { servicios: ServicioManual[] }) =>
      (await api.put<ServicioManual[]>('/talleres/servicios', body)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['talleres', 'servicios'] });
      qc.invalidateQueries({ queryKey: ['talleres', 'desposte'] });
      qc.invalidateQueries({ queryKey: ['talleres', 'acondicionamiento'] });
    },
  });
}

// ---- Costo de ganado ----

export type MetodoCosto = 'kg_pie' | 'kg_finca' | 'kg_canal' | 'por_animal' | 'valor_total';
export const METODO_LABEL: Record<MetodoCosto, string> = {
  kg_pie: 'Por kg en pie',
  kg_finca: 'Por kg en finca',
  kg_canal: 'Por kg en canal',
  por_animal: 'Por animal',
  valor_total: 'Valor total del lote',
};
export const METODO_VALOR: Record<MetodoCosto, string> = {
  kg_pie: 'Precio por kg en pie',
  kg_finca: 'Precio por kg en finca',
  kg_canal: 'Precio por kg en canal',
  por_animal: 'Precio por animal',
  valor_total: 'Valor total del lote',
};

export interface LoteCosto {
  ordenId: string;
  reference: number;
  fecha: string;
  cliente: string;
  guias: string[];
  observaciones: string | null;
  animales: number;
  proveedor: string | null;
  pesoPieKg: number;
  pesoCanalKg: number;
  costo: {
    metodo: MetodoCosto;
    valorUnitario: number;
    pesoFincaKg: number | null;
    proveedor: string | null;
    referencia: string | null;
    observaciones: string | null;
    total: number | null;
    porKgPie: number | null;
    porKgCanal: number | null;
    porAnimal: number | null;
  } | null;
}

export function useCostosGanado(desde: string, hasta: string) {
  return useQuery({
    queryKey: ['talleres', 'costo-ganado', desde, hasta],
    queryFn: async () =>
      (await api.get<LoteCosto[]>('/talleres/costo-ganado', { params: { desde: desde || undefined, hasta: hasta || undefined } })).data,
  });
}

export function useGuardarCostoGanado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      ordenId,
      ...body
    }: {
      ordenId: string;
      metodo: MetodoCosto;
      valorUnitario: number;
      pesoFincaKg?: number | null;
      proveedor?: string;
      referencia?: string;
      observaciones?: string;
    }) => (await api.put(`/talleres/costo-ganado/${ordenId}`, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['talleres', 'costo-ganado'] }),
  });
}

export function useEliminarCostoGanado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ordenId: string) => (await api.delete(`/talleres/costo-ganado/${ordenId}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['talleres', 'costo-ganado'] }),
  });
}

/** Total del lote según el método (mismo cálculo que el servidor, para la vista previa). */
export function totalCosto(metodo: MetodoCosto, valor: number, l: Pick<LoteCosto, 'pesoPieKg' | 'pesoCanalKg' | 'animales'>, pesoFincaKg: number | null) {
  switch (metodo) {
    case 'kg_pie':
      return valor * l.pesoPieKg;
    case 'kg_finca':
      return pesoFincaKg ? valor * pesoFincaKg : null;
    case 'kg_canal':
      return valor * l.pesoCanalKg;
    case 'por_animal':
      return valor * l.animales;
    case 'valor_total':
      return valor;
  }
}

export const pesos = (v: number) => v.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
export const pesosDec = (v: number) => v.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 2, maximumFractionDigits: 2 });
