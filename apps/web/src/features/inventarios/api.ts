import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { CanalTipo } from '../canal-caliente/api';

// Debe coincidir EXACTO con los valores que guarda Canal Caliente/Traslado
// en CanalPieza.cava (apps/web/src/features/canal-caliente/api.ts),
// o esta pestaña nunca mostraría las canales ubicadas ahí.
export const CAVAS = [
  'CAVA 1',
  'CAVA 2',
  'CAVA 3',
  'CAVA 4',
  'CAVA 5',
  'SALA DE OREO',
  'CAVA DESPACHO',
];
export const CAVAS_SUBPRODUCTO = ['1', '2', '3'];

export interface CavaAnimalRow {
  piezaId: string;
  eventoId: string;
  reference: number;
  cliente: string;
  date: string;
  canalAnimalTipo: string | null;
  canalTipo: CanalTipo | null;
  sequence: number;
  turno: number | null;
  pieza: 'canal' | 'cizq' | 'cder';
  bodega: string | null;
  destino: string | null;
  observaciones: string | null;
  pesoKg: number;
  /** Orden de despacho activa (y de producción) en la que ya está la pieza; null = libre en cava. */
  enOrden: { odNumber: number; opNumbers: number[] } | null;
  /** Orden de despacho de canales (DC) activa en la que está; sale del inventario al cerrarla. */
  enDespacho: { dcNumber: number; tipo: 'caliente' | 'frio' } | null;
}

export type CavaSubproductoCategoria =
  | 'retoma'
  | 'viscera_blanca'
  | 'viscera_roja'
  | 'cabeza_patas';

export interface CavaSubproductoRow {
  itemId: string;
  tipo: string;
  codigo: string;
  label: string;
  unidad: 'unidad' | 'kg';
  categoria: CavaSubproductoCategoria;
  cantidad: number | null;
  pesoKg: number | null;
  reference: number;
  cliente: string;
  date: string;
  registradoAt: string | null;
}

export function useCava(cava: string) {
  return useQuery({
    queryKey: ['inventarios', 'cava', cava],
    queryFn: async () =>
      (await api.get<CavaAnimalRow[]>(`/inventarios/cavas/${cava}`)).data,
    refetchInterval: 5000,
  });
}

export interface BodegaResumen {
  id: string;
  code: number;
  nombre: string;
  clienteId: string;
  clienteNit: string | null;
  cliente: string;
  canales: number;
  canalesKg: number;
  /** Canales de órdenes DC (frío/caliente) ya cerradas: siguen visibles como despachadas. */
  canalesDespachadas: number;
  /** Canales de OD a proceso cerradas en Canal Fría: siguen visibles como procesadas. */
  canalesProcesadas: number;
  productos: number;
  productosKg: number;
  subproductos: number;
}

export interface BodegaDetalle {
  id: string;
  code: number;
  nombre: string;
  clienteNit: string | null;
  cliente: string;
  canales: {
    id: string;
    reference: number;
    date: string;
    sequence: number;
    turno: number | null;
    canalTipo: CanalTipo | null;
    canalAnimalTipo: string | null;
    pieza: 'canal' | 'cizq' | 'cder';
    cava: string | null;
    destino: string | null;
    observaciones: string | null;
    pesoKg: number;
    pesoFrioKg: number | null;
    /** OD a proceso: activa = sigue en cava; `cerrada` = ya salió a desposte (procesada). */
    enOrden: {
      odNumber: number;
      opNumbers: number[];
      cerrada: boolean;
      cerradaAt: string | null;
    } | null;
    /** Orden DC: activa = sigue en cava; `cerrada` = ya salió de planta (despachada). */
    enDespacho: {
      dcNumber: number;
      tipo: 'caliente' | 'frio';
      cerrada: boolean;
      cerradaAt: string | null;
    } | null;
  }[];
  productos: {
    id: string;
    codigo: string | null;
    pieza: number;
    productoCodigo: string;
    productoNombre: string;
    tiendaCodigo: string;
    tienda: string;
    canastilla: number | null;
    netoKg: number;
    conservacion: string;
    sobrante: boolean;
    fechaEmpaque: string;
    fechaVencimiento: string | null;
    opNumber: number | null;
    /** Producto etiquetado en Rotulado Acondicionamiento (lote OC) y la OT de donde salió. */
    ocNumber: number | null;
    origenOt: number | null;
    trasladoOt: number | null;
    /** OC cerrada en la que esta pieza se transformó en otro producto. */
    transformadoOc: number | null;
    /** Orden DC (posta) activa en la que va; al cerrarla sale del inventario. */
    despachoDc: number | null;
  }[];
  /** Subproductos en cava de las órdenes de beneficio cuyas canales quedaron en esta bodega. */
  subproductos: {
    id: string;
    tipo: string;
    codigo: string;
    label: string;
    unidad: 'unidad' | 'kg';
    categoria: CavaSubproductoCategoria;
    cantidad: number | null;
    pesoKg: number | null;
    cava: string | null;
    reference: number;
    date: string;
    registradoAt: string | null;
  }[];
}

export function useBodegasInventario() {
  return useQuery({
    queryKey: ['inventarios', 'bodegas'],
    queryFn: async () => (await api.get<BodegaResumen[]>('/inventarios/bodegas')).data,
    refetchInterval: 10000,
  });
}

export function useBodegaInventario(id: string | null) {
  return useQuery({
    queryKey: ['inventarios', 'bodegas', id],
    queryFn: async () => (await api.get<BodegaDetalle>(`/inventarios/bodegas/${id}`)).data,
    enabled: !!id,
    refetchInterval: 10000,
  });
}

export function useCavaSubproducto(cava: string) {
  return useQuery({
    queryKey: ['inventarios', 'cava-subproducto', cava],
    queryFn: async () =>
      (
        await api.get<CavaSubproductoRow[]>(
          `/inventarios/cavas-subproducto/${cava}`,
        )
      ).data,
    refetchInterval: 5000,
  });
}

export type EstadoTrazabilidad =
  | 'disponible'
  | 'en_proceso'
  | 'procesada'
  | 'en_despacho'
  | 'despachada'
  | 'sin_cava';

export interface TrazabilidadCanal {
  piezaId: string;
  pieza: 'canal' | 'cizq' | 'cder';
  turno: number | null;
  canalTipo: CanalTipo | null;
  estado: EstadoTrazabilidad;
  cavaActual: string | null;
  guias: string[];
  guia: {
    guia: string | null;
    bcReference: number;
    referenciaLote: string | null;
    date: string;
    proveedor: string | null;
    procedencia: string | null;
    cliente: string | null;
    placa: string | null;
    conductor: string | null;
    cantidad: number | null;
    entradaKg: number | null;
    salidaKg: number | null;
    netoKg: number | null;
    promedioKg: number | null;
    observaciones: string | null;
    registradaPor: string | null;
    createdAt: string;
  } | null;
  pie: {
    bpReference: number;
    reference: number;
    corral: string | null;
    tipoAnimal: string | null;
    tipoPesaje: string;
    pesoInicialKg: number | null;
    pesoActualKg: number | null;
    repesajes: {
      ronda: number;
      pesoAnteriorKg: number;
      pesoNuevoKg: number;
      mermaKg: number;
      at: string;
      operario: string | null;
    }[];
    observaciones: string | null;
    pesadoAt: string;
    operario: string | null;
  } | null;
  ordenBeneficio: {
    reference: number;
    date: string;
    cliente: string;
    animalCount: number;
    status: string;
    observaciones: string | null;
    subproductoDestino: string;
    creadaPor: string | null;
    createdAt: string;
  };
  sacrificio: { sequence: number; at: string; operario: string | null };
  piel: { kg: number | null; at: string | null; operario: string | null } | null;
  canal: {
    tipoAnimal: string | null;
    canalTipo: CanalTipo | null;
    conCola: boolean | null;
    expendio: string | null;
    pesoKg: number;
    weighedAt: string;
    operario: string | null;
    bodega: string | null;
    destino: string | null;
    observaciones: string | null;
    piezasAnimal: {
      id: string;
      pieza: 'canal' | 'cizq' | 'cder';
      pesoKg: number;
      turno: number | null;
      actual: boolean;
    }[];
  };
  traslados: {
    cavaOrigen: string | null;
    cavaDestino: string;
    motivo: string;
    at: string;
    operario: string | null;
  }[];
  subproductos: {
    tipo: string;
    label: string;
    codigo: string;
    categoria: CavaSubproductoCategoria;
    unidad: 'unidad' | 'kg';
    cantidad: number | null;
    pesoKg: number | null;
    cava: string | null;
    at: string | null;
    operario: string | null;
  }[];
  despachoProceso: {
    odNumber: number;
    status: string;
    cliente: string;
    processDate: string;
    cavaOrigen: string;
    pesoCalienteKg: number;
    despachoKg: number | null;
    pistoleadaAt: string;
    operario: string | null;
    cerradaAt: string | null;
    ordenesProduccion: {
      opNumber: number;
      status: string;
      processDate: string;
      etiquetas: number;
    }[];
  } | null;
  despachoCanal: {
    dcNumber: number;
    tipo: 'caliente' | 'frio' | 'posta';
    status: string;
    cliente: string;
    processDate: string;
    cavaOrigen: string;
    pesoCalienteKg: number;
    despachoKg: number | null;
    pistoleadaAt: string;
    operario: string | null;
    cerradaAt: string | null;
  } | null;
}

export function useTrazabilidadCanal(piezaId: string | null) {
  return useQuery({
    queryKey: ['inventarios', 'trazabilidad', piezaId],
    queryFn: async () =>
      (await api.get<TrazabilidadCanal>(`/inventarios/canales/${piezaId}/trazabilidad`)).data,
    enabled: !!piezaId,
  });
}
