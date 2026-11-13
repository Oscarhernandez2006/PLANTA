import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface UsuarioPermisos {
  id: string;
  fullName: string;
  documentId: string | null;
  role: string;
  active: boolean;
  accesoTotal: boolean;
  modulos: string[];
  /** Autorizador de operaciones: valida acciones sensibles con cédula + PIN. */
  autorizador: boolean;
}

export function useUsuariosPermisos() {
  return useQuery({
    queryKey: ['permisos', 'usuarios'],
    queryFn: async () => (await api.get<UsuarioPermisos[]>('/permisos/usuarios')).data,
  });
}

export function useGuardarPermisos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      accesoTotal,
      modulos,
      autorizador,
    }: {
      id: string;
      accesoTotal: boolean;
      modulos: string[];
      autorizador: boolean;
    }) =>
      (await api.patch<UsuarioPermisos>(`/permisos/usuarios/${id}`, { accesoTotal, modulos, autorizador })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['permisos'] }),
  });
}
