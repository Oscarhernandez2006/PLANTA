import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface ConservacionCliente {
  id: string;
  concepto: string;
  nit: string | null;
  productos: number;
}

export const TIPOS_CONSERVACION = ['TERMINADO', 'EN PROCESO', 'MATERIA PRIMA', 'SUBPRODUCTO'];

export interface DatosConservacion {
  tipo: string;
  refPluSku: string | null;
  refrigeradoDias: number;
  refrigeradoTemp: string;
  congeladoDias: number;
  congeladoTemp: string;
}

export interface ProductoAsignado extends DatosConservacion {
  id: string;
  codigo: string;
  nombre: string;
  categoria: string | null;
  active: boolean;
}

export function useConservacionClientes() {
  return useQuery({
    queryKey: ['conservacion', 'clientes'],
    queryFn: async () =>
      (await api.get<ConservacionCliente[]>('/conservacion/clientes')).data,
  });
}

export function useProductosCliente(clienteId: string) {
  return useQuery({
    queryKey: ['conservacion', 'productos', clienteId],
    queryFn: async () =>
      (
        await api.get<ProductoAsignado[]>(
          `/conservacion/clientes/${clienteId}/productos`,
        )
      ).data,
  });
}

export function useAsignarProducto(clienteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<DatosConservacion> & { productId: string }) =>
      (await api.post(`/conservacion/clientes/${clienteId}/productos`, input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conservacion'] }),
  });
}

export function useActualizarConservacion(clienteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      productId,
      ...datos
    }: Partial<DatosConservacion> & { productId: string }) =>
      (
        await api.patch(
          `/conservacion/clientes/${clienteId}/productos/${productId}`,
          datos,
        )
      ).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conservacion'] }),
  });
}

export function useQuitarProducto(clienteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (productId: string) =>
      (await api.delete(`/conservacion/clientes/${clienteId}/productos/${productId}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conservacion'] }),
  });
}
