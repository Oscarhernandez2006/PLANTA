import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { MOCK_ETIQUETAS, MOCK_ORDENES, MOCK_PRODUCTOS } from './mock';

export type RotuladoStage = 'desposte' | 'acondicionamiento';
export type Conservacion = 'refrigerado' | 'congelado';
export type ProductoCategoria =
  | 'materia_prima'
  | 'subproducto'
  | 'terminado';

export interface Tienda {
  codTienda: number;
  nombre: string;
  ref?: string | null;
}

export interface Movimiento {
  empaques?: number | null;
  codigo: string;
  producto: string;
  unds: number;
  peso: number;
  movimiento: string;
}

export interface RotuladoOrden {
  id: string;
  stage: RotuladoStage;
  date: string;
  lote: number;
  ordenTraslado: number;
  clientNit: string;
  clientName: string;
  tiendas: Tienda[];
  movimientos: Movimiento[];
  recibidoKg: number | null;
  status: 'abierta' | 'cerrada';
}

export interface RotuladoEtiqueta {
  id: string;
  ordenId: string;
  stage: RotuladoStage;
  codTienda: number | null;
  tienda: string | null;
  codigoProducto: string | null;
  producto: string | null;
  fechaSacrificio: string | null;
  fechaEmpaque: string | null;
  fechaVencimiento: string | null;
  dias: number | null;
  conservacion: Conservacion;
  ref: string | null;
  empaque: string | null;
  tara: number | null;
  bruto: number | null;
  neto: number | null;
  bodega: string | null;
  procesadoPara: string | null;
  imprimir: boolean;
  barcode: string;
  createdAt: string;
}

export interface RotuladoProducto {
  id: string;
  categoria: ProductoCategoria;
  codigo: string | null;
  nombre: string;
}

export interface RotuladoReporte {
  orden: RotuladoOrden;
  movimientos: Movimiento[];
  unidades: number;
  recibido: number;
  procesado: number;
  merma: number;
  mermaPct: number | null;
}

// ============================================================================
// Datos temporales (mock) en el frontend — sin backend ni base de datos.
// Cuando la DB real esté disponible, reemplazar estos hooks por llamadas HTTP.
// ============================================================================

// Copia mutable en memoria de las etiquetas por orden.
const etiquetasStore: Record<string, RotuladoEtiqueta[]> = Object.fromEntries(
  Object.entries(MOCK_ETIQUETAS).map(([k, v]) => [k, v.map((e) => ({ ...e }))]),
);

function listEtiquetas(ordenId: string) {
  return etiquetasStore[ordenId] ?? [];
}

function newBarcode() {
  const ts = Date.now().toString(36).toUpperCase();
  const rnd = Math.floor(Math.random() * 46656)
    .toString(36)
    .toUpperCase()
    .padStart(3, '0');
  return `RT${ts}${rnd}`;
}

// ============================== ÓRDENES ================================

export function useOrdenes(stage: RotuladoStage, date?: string) {
  return useQuery({
    queryKey: ['rotulado', 'ordenes', stage, date],
    queryFn: async () =>
      MOCK_ORDENES.filter(
        (o) => o.stage === stage && (!date || o.date === date),
      ),
  });
}

export interface SaveOrdenInput {
  stage: RotuladoStage;
  date?: string;
  lote: number;
  ordenTraslado: number;
  clientNit: string;
  clientName: string;
  tiendas?: Tienda[];
  movimientos?: Movimiento[];
  recibidoKg?: number;
}

export function useUpsertOrden() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveOrdenInput): Promise<RotuladoOrden> => ({
      id: `ord-tmp-${Date.now()}`,
      stage: input.stage,
      date: input.date ?? new Date().toISOString().slice(0, 10),
      lote: input.lote,
      ordenTraslado: input.ordenTraslado,
      clientNit: input.clientNit,
      clientName: input.clientName,
      tiendas: input.tiendas ?? [],
      movimientos: input.movimientos ?? [],
      recibidoKg: input.recibidoKg ?? null,
      status: 'abierta',
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rotulado', 'ordenes'] }),
  });
}

// ============================= ETIQUETAS ===============================

export function useEtiquetas(ordenId: string | null) {
  return useQuery({
    enabled: !!ordenId,
    queryKey: ['rotulado', 'etiquetas', ordenId],
    queryFn: async () => (ordenId ? listEtiquetas(ordenId) : []),
  });
}

export interface SaveEtiquetaInput {
  ordenId: string;
  codTienda?: number;
  tienda?: string;
  codigoProducto?: string;
  producto?: string;
  fechaSacrificio?: string;
  fechaEmpaque?: string;
  fechaVencimiento?: string;
  dias?: number;
  conservacion?: Conservacion;
  ref?: string;
  empaque?: string;
  tara?: number;
  bruto?: number;
  neto?: number;
  bodega?: string;
  procesadoPara?: string;
  imprimir?: boolean;
}

export function useCreateEtiqueta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveEtiquetaInput): Promise<RotuladoEtiqueta> => {
      const stage =
        MOCK_ORDENES.find((o) => o.id === input.ordenId)?.stage ?? 'desposte';
      const row: RotuladoEtiqueta = {
        id: newBarcode(),
        ordenId: input.ordenId,
        stage,
        codTienda: input.codTienda ?? null,
        tienda: input.tienda ?? null,
        codigoProducto: input.codigoProducto ?? null,
        producto: input.producto ?? null,
        fechaSacrificio: input.fechaSacrificio ?? null,
        fechaEmpaque: input.fechaEmpaque ?? null,
        fechaVencimiento: input.fechaVencimiento ?? null,
        dias: input.dias ?? null,
        conservacion: input.conservacion ?? 'refrigerado',
        ref: input.ref ?? null,
        empaque: input.empaque ?? null,
        tara: input.tara ?? null,
        bruto: input.bruto ?? null,
        neto: input.neto ?? null,
        bodega: input.bodega ?? null,
        procesadoPara: input.procesadoPara ?? null,
        imprimir: input.imprimir ?? true,
        barcode: newBarcode(),
        createdAt: new Date().toISOString(),
      };
      etiquetasStore[input.ordenId] = [...listEtiquetas(input.ordenId), row];
      return row;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ['rotulado', 'etiquetas', row.ordenId] });
      qc.invalidateQueries({ queryKey: ['rotulado', 'reporte', row.ordenId] });
    },
  });
}

export function useRemoveEtiqueta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      for (const k of Object.keys(etiquetasStore)) {
        etiquetasStore[k] = etiquetasStore[k].filter((e) => e.id !== id);
      }
      return { ok: true };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rotulado', 'etiquetas'] });
      qc.invalidateQueries({ queryKey: ['rotulado', 'reporte'] });
    },
  });
}

export async function fetchEtiquetaByBarcode(barcode: string) {
  const code = barcode.trim().toLowerCase();
  const found = Object.values(etiquetasStore)
    .flat()
    .find((e) => e.barcode.toLowerCase() === code);
  if (!found) throw new Error('Etiqueta no encontrada.');
  return found;
}

// ============================== REPORTE ================================

export function useReporte(ordenId: string | null) {
  return useQuery({
    enabled: !!ordenId,
    queryKey: ['rotulado', 'reporte', ordenId],
    queryFn: async (): Promise<RotuladoReporte> => {
      const orden = MOCK_ORDENES.find((o) => o.id === ordenId);
      if (!orden) throw new Error('Orden no encontrada.');
      const etiquetas = ordenId ? listEtiquetas(ordenId) : [];
      const recibido = orden.recibidoKg ?? 0;
      const procesado = etiquetas.reduce((s, e) => s + (e.neto ?? 0), 0);
      const merma = recibido - procesado;
      const mermaPct = recibido > 0 ? (merma / recibido) * 100 : null;
      return {
        orden,
        movimientos: orden.movimientos,
        unidades: etiquetas.length,
        recibido,
        procesado,
        merma,
        mermaPct,
      };
    },
  });
}

// ============================= PRODUCTOS ===============================

export function useProductos(
  categoria: ProductoCategoria,
  letra: string,
  search: string,
) {
  return useQuery({
    queryKey: ['rotulado', 'productos', categoria, letra, search],
    queryFn: async () =>
      MOCK_PRODUCTOS.filter((p) => {
        if (p.categoria !== categoria) return false;
        if (search) {
          return p.nombre.toLowerCase().includes(search.toLowerCase());
        }
        if (letra) {
          return p.nombre.toUpperCase().startsWith(letra.toUpperCase());
        }
        return true;
      }),
  });
}
