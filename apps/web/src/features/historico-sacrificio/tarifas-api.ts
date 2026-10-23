import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { TarifaSacrificio } from './beneficio-api';
import type { TarifaSubproducto } from './retomas-api';

export type SaveTarifaSacrificio = Omit<TarifaSacrificio, 'id'>;
export type SaveTarifaSubproducto = Omit<TarifaSubproducto, 'id'>;

const KEY = ['historico-sacrificio'];

export function useGuardarTarifaSacrificio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: SaveTarifaSacrificio }) =>
      id
        ? (await api.patch(`/historico-sacrificio/tarifas/${id}`, input)).data
        : (await api.post('/historico-sacrificio/tarifas', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, 'tarifas'] }),
  });
}

export function useBorrarTarifaSacrificio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/historico-sacrificio/tarifas/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, 'tarifas'] }),
  });
}

export function useGuardarTarifaSubproducto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: SaveTarifaSubproducto }) =>
      id
        ? (await api.patch(`/historico-sacrificio/tarifas-subproductos/${id}`, input)).data
        : (await api.post('/historico-sacrificio/tarifas-subproductos', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, 'tarifas-subproductos'] }),
  });
}

export function useBorrarTarifaSubproducto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.delete(`/historico-sacrificio/tarifas-subproductos/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, 'tarifas-subproductos'] }),
  });
}
