import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Rol } from '@/lib/roles';

export interface Usuario {
  id: string;
  fullName: string;
  documentId: string | null;
  role: Rol;
  active: boolean;
  accesoTotal: boolean;
  modulos: string[];
  lastLogin: string | null;
  createdAt: string;
}

export interface UsuarioInput {
  fullName?: string;
  documentId?: string;
  role?: Rol;
  /** Solo se envía al crear o al cambiar el PIN. */
  pin?: string;
  active?: boolean;
}

export function useUsuarios() {
  return useQuery({
    queryKey: ['usuarios'],
    queryFn: async () => (await api.get<Usuario[]>('/usuarios')).data,
  });
}

export function useCrearUsuario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Required<Omit<UsuarioInput, 'active'>> & { active?: boolean }) =>
      (await api.post<Usuario>('/usuarios', input)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['usuarios'] });
      qc.invalidateQueries({ queryKey: ['permisos'] });
    },
  });
}

export function useActualizarUsuario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: UsuarioInput & { id: string }) =>
      (await api.patch<Usuario>(`/usuarios/${id}`, input)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['usuarios'] });
      qc.invalidateQueries({ queryKey: ['permisos'] });
    },
  });
}
