import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface Product {
  id: string;
  codigo: string;
  nombre: string;
  categoria?: string | null;
  active?: boolean;
}

export function useProducts(search: string) {
  return useQuery({
    queryKey: ['products', search],
    queryFn: async () =>
      (
        await api.get<Product[]>('/products', {
          params: search ? { search } : undefined,
        })
      ).data,
  });
}

/** Todos los productos (activos e inactivos) para el módulo de Productos. */
export function useProductsAdmin(search: string) {
  return useQuery({
    queryKey: ['products', 'admin', search],
    queryFn: async () =>
      (
        await api.get<Required<Product>[]>('/products', {
          params: { todos: true, ...(search ? { search } : {}) },
        })
      ).data,
  });
}

/** Categorías del catálogo, en el orden del listado de planta. */
export const CATEGORIAS_PRODUCTO = [
  'PRODUCTO EN PROCESO',
  'RES EN PIE O EN CANAL',
  'RES CARNES FINAS',
  'RES CARNE DE PRIMERA - TRASERA',
  'RES CARNES DE SEGUNDA - DELANTERA',
  'RES CARNES DE TERCERA - LIMPIEZA',
  'RES VISCERAS COMPLETAS',
  'RES SUBPRODUCTOS',
  'RES PRODUCTOS TERMINADOS',
];

/** Tipo de conservación que corresponde a la categoría del producto. */
export function tipoPorCategoria(categoria?: string | null): string {
  switch (categoria) {
    case 'PRODUCTO EN PROCESO':
      return 'EN PROCESO';
    case 'RES SUBPRODUCTOS':
      return 'SUBPRODUCTO';
    case 'RES PRODUCTOS TERMINADOS':
      return 'TERMINADO';
    default:
      return 'MATERIA PRIMA';
  }
}

export function useNextProductCode() {
  return useQuery({
    queryKey: ['products', 'next-code'],
    queryFn: async () =>
      (await api.get<{ next: string }>('/products/next-code')).data,
  });
}

/** Etiquetas disponibles en planta por producto. */
export function useExistenciasProductos() {
  return useQuery({
    queryKey: ['products', 'existencias'],
    queryFn: async () =>
      (await api.get<{ productId: string; unds: number; kg: number }[]>('/products/existencias')).data,
  });
}

export interface FichaProducto {
  producto: Required<Product> & { createdAt: string };
  clientes: {
    clienteId: string;
    cliente: string;
    nit: string | null;
    tipo: string;
    refPluSku: string | null;
    refrigeradoDias: number;
    congeladoDias: number;
    piezasPorCanal: number;
    undsPorCaja: number;
  }[];
  inventario: { unds: number; kg: number };
  produccion30: { unds: number; kg: number };
  etiquetasTotal: number;
  ultimaEtiqueta: string | null;
  precios: { lista: string; cliente: string | null; vigenteDesde: string; precioKg: number }[];
  reglas: { cliente: string | null; retoma: boolean; piking: boolean; congelacion: boolean; kgCongelados: number | null }[];
}

export function useFichaProducto(id: string | null) {
  return useQuery({
    queryKey: ['products', 'ficha', id],
    queryFn: async () => (await api.get<FichaProducto>(`/products/${id}/ficha`)).data,
    enabled: !!id,
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { nombre: string; categoria?: string }) =>
      (await api.post<Product>('/products', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });
}

export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: {
      id: string;
      nombre?: string;
      categoria?: string;
      active?: boolean;
    }) => (await api.patch<Product>(`/products/${id}`, input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });
}
