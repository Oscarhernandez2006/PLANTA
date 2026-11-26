import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** Órdenes que se alistan con picking en la terminal móvil. */
export type TipoPicking = 'posta' | 'traslado';
export type EstadoPreorden = 'en_curso' | 'terminado';

export interface ItemPicking {
  id: string;
  codigo: string;
  tipo: string;
  productoCodigo: string;
  productoNombre: string;
  unds: number;
  netoEtiquetaKg: number;
  createdAt: string;
  /** Ya se registró en la orden (se pesó en el despacho). */
  pesado: boolean;
}

/** Etiqueta de la orden con su pre-orden; `listo`: la pre-orden está terminada (se puede pesar). */
export type ItemOrdenPicking = ItemPicking & { preordenId: string; preorden: string; listo: boolean };

export interface LineaAvance {
  productoId: string;
  productoCodigo: string;
  productoNombre: string;
  plu: string | null;
  productoCliente: string | null;
  /** null: el producto no está en la orden de compra. */
  kgPedidos: number | null;
  empaques: number;
  kgAlistados: number;
  kgPesados: number;
  completo: boolean;
}

export interface PreordenResumen {
  id: string;
  nombre: string;
  ocNumero: string | null;
  tiendaCodigo: string | null;
  tiendaNombre: string | null;
  observaciones: string | null;
  /** Alistador que tiene la pre-orden en la terminal. */
  asignado: { id: string; nombre: string } | null;
  asignadoAt: string | null;
  status: EstadoPreorden;
  terminadoAt: string | null;
  empaques: number;
  porPesar: number;
  kgPedidos: number;
  kgAlistados: number;
  kgCumplidos: number;
  /** % de la orden de compra alistado (por kilos); null sin orden de compra. */
  porcentaje: number | null;
  lineasCompletas: number;
  lineasTotal: number;
  avance: LineaAvance[];
}

export interface Preorden extends PreordenResumen {
  items: ItemPicking[];
  orden: { tipo: TipoPicking; id: string; numero: string; activa: boolean };
}

export interface PickingOrden {
  orden: string;
  ordenActiva: boolean;
  porcentaje: number | null;
  kgPedidos: number;
  preordenes: PreordenResumen[];
  items: ItemOrdenPicking[];
}

export interface GuardarPreordenInput {
  ocNumero?: string;
  tiendaCodigo?: string;
  tiendaNombre?: string;
  observaciones?: string;
  lineas: { productoId: string; kgPedidos: number }[];
}

export interface FilaOrdenCompra {
  tiendaCodigo?: string;
  tiendaNombre?: string;
  ocNumero: string;
  plu: string;
  producto?: string;
  kgPedidos: number;
}

export interface ResultadoImportacion {
  pendientes: { plu: string; producto: string | null }[];
  creadas: number;
  actualizadas: number;
}

/** Pre-órdenes de la orden con su avance y todas las etiquetas alistadas. */
export function usePicking(tipo: TipoPicking | undefined, ordenId: string | null) {
  return useQuery({
    queryKey: ['picking', tipo, ordenId],
    queryFn: async () => (await api.get<PickingOrden>(`/picking/${tipo}/${ordenId}`)).data,
    enabled: !!tipo && !!ordenId,
    refetchInterval: 10_000,
  });
}

export function usePreorden(id: string | null) {
  return useQuery({
    queryKey: ['picking', 'preorden', id],
    queryFn: async () => (await api.get<Preorden>(`/picking/preordenes/${id}`)).data,
    enabled: !!id,
  });
}

function useInvalidarPicking() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['picking'] });
}

/** Crea (id null) o actualiza una pre-orden con su orden de compra. */
export function useGuardarPreorden(tipo: TipoPicking, ordenId: string) {
  const invalidar = useInvalidarPicking();
  return useMutation({
    mutationFn: async ({ id, ...dto }: GuardarPreordenInput & { id: string | null }) =>
      (id
        ? await api.put<Preorden>(`/picking/preordenes/${id}`, dto)
        : await api.post<Preorden>(`/picking/${tipo}/${ordenId}/preordenes`, dto)
      ).data,
    onSuccess: invalidar,
  });
}

export function useEliminarPreorden() {
  const invalidar = useInvalidarPicking();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/picking/preordenes/${id}`);
    },
    onSuccess: invalidar,
  });
}

/** Libera la pre-orden asignada a un alistador (supervisor/admin). */
export function useLiberarPreorden() {
  const invalidar = useInvalidarPicking();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.patch(`/picking/preordenes/${id}/liberar`);
    },
    onSuccess: invalidar,
  });
}

/** Importa el Excel de órdenes de compra (una pre-orden por OC); devuelve los PLU sin equivalencia. */
export function useImportarOrdenesCompra(tipo: TipoPicking, ordenId: string) {
  const invalidar = useInvalidarPicking();
  return useMutation({
    mutationFn: async (dto: { filas: FilaOrdenCompra[]; mapeos?: { plu: string; productoId: string }[] }) =>
      (await api.post<ResultadoImportacion>(`/picking/${tipo}/${ordenId}/importar`, dto)).data,
    onSuccess: invalidar,
  });
}

/** Valida la clave del supervisor para cerrar la orden con pre-órdenes sin alistar al 100 %. */
export async function autorizarCierre(tipo: TipoPicking, ordenId: string, pin: string) {
  await api.post(`/picking/${tipo}/${ordenId}/autorizar-cierre`, { pin });
}

export interface LineaArrume {
  id: string;
  codigo: string;
  productoCodigo: string;
  productoNombre: string;
  unds: number;
  netoEtiquetaKg: number;
}

/** Arrume abierto: peso de la báscula vs. neto de las etiquetas pistoleadas. */
export interface Arrume {
  id: string;
  numero: number;
  pesoBrutoKg: number;
  taraCanastillaKg: number;
  taraEstibaKg: number;
  canastillas: number;
  taraTotalKg: number;
  netoKg: number;
  netoEtiquetasKg: number;
  diferenciaKg: number;
  toleranciaKg: number;
  items: LineaArrume[];
}

export interface PesoArrume {
  pesoBrutoKg: number;
  taraCanastillaKg: number;
  taraEstibaKg: number;
}

export function useArrumeAbierto(tipo: TipoPicking, ordenId: string | null) {
  return useQuery({
    queryKey: ['arrume', tipo, ordenId],
    queryFn: async () =>
      (await api.get<{ arrume: Arrume | null }>(`/picking/${tipo}/${ordenId}/arrume`)).data.arrume,
    enabled: !!ordenId,
  });
}

/** Lo que cambia al registrar o quitar etiquetas del arrume. */
export function useInvalidarArrume(tipo: TipoPicking, ordenId: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['arrume', tipo, ordenId] });
    qc.invalidateQueries({
      queryKey: tipo === 'posta' ? ['canal-dispatch-orders', ordenId, 'productos'] : ['transfer-orders', ordenId, 'items'],
    });
    qc.invalidateQueries({ queryKey: ['picking'] });
    qc.invalidateQueries({ queryKey: ['inventarios'] });
  };
}

export function useIniciarArrume(tipo: TipoPicking, ordenId: string) {
  const invalidar = useInvalidarArrume(tipo, ordenId);
  return useMutation({
    mutationFn: async (dto: PesoArrume) => (await api.post<Arrume>(`/picking/${tipo}/${ordenId}/arrume`, dto)).data,
    onSettled: invalidar,
  });
}

export function useRepesarArrume(tipo: TipoPicking, ordenId: string) {
  const invalidar = useInvalidarArrume(tipo, ordenId);
  return useMutation({
    mutationFn: async ({ id, ...dto }: PesoArrume & { id: string }) =>
      (await api.patch<Arrume>(`/picking/arrumes/${id}`, dto)).data,
    onSettled: invalidar,
  });
}

export function useAgregarArrume(tipo: TipoPicking, ordenId: string) {
  const invalidar = useInvalidarArrume(tipo, ordenId);
  return useMutation({
    mutationFn: async ({ id, ...dto }: { id: string; codigo: string; pin?: string; pickingId?: string }) =>
      (
        await api.post<{ arrume: Arrume; advertenciaInventario: string | null; item: { productoNombre: string; netoEtiquetaKg: number } }>(
          `/picking/arrumes/${id}/codigos`,
          dto,
        )
      ).data,
    onSettled: invalidar,
  });
}

export function useTerminarArrume(tipo: TipoPicking, ordenId: string) {
  const invalidar = useInvalidarArrume(tipo, ordenId);
  return useMutation({
    mutationFn: async (id: string) => (await api.patch<Arrume>(`/picking/arrumes/${id}/terminar`)).data,
    onSettled: invalidar,
  });
}

export function useCancelarArrume(tipo: TipoPicking, ordenId: string) {
  const invalidar = useInvalidarArrume(tipo, ordenId);
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/picking/arrumes/${id}`);
    },
    onSettled: invalidar,
  });
}