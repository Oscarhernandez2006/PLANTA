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
  productos: number;
  productosKg: number;
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
    pesoKg: number;
    pesoFrioKg: number | null;
    enOrden: { odNumber: number; opNumbers: number[] } | null;
    enDespacho: { dcNumber: number; tipo: 'caliente' | 'frio' } | null;
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
