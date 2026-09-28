import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { OrdenBeneficioStatus } from '../registrar/orden-beneficio-api';
import type { CanalAnimalTipo, CanalPiezaTipo, CanalTipo } from '../canal-caliente/api';

export interface InformeCanalCalienteRow {
  id: string;
  reference: number;
  cliente: string;
  destino: string | null;
  date: string;
  status: OrdenBeneficioStatus;
}

export function useInformeCanalCaliente(hasta: string) {
  return useQuery({
    queryKey: ['informes', 'canal-caliente', hasta],
    queryFn: async () =>
      (
        await api.get<InformeCanalCalienteRow[]>('/informes/canal-caliente', {
          params: { hasta },
        })
      ).data,
  });
}

export interface DetallePieza {
  piezaId: string;
  sequence: number;
  turno: number | null;
  pieza: CanalPiezaTipo;
  canalTipo: CanalTipo | null;
  canalAnimalTipo: CanalAnimalTipo | null;
  observaciones: string | null;
  codigo: string;
  producto: string;
  pesoKg: number;
}

export interface DetalleCanalCaliente {
  id: string;
  reference: number;
  cliente: string;
  clienteNit: string | null;
  clienteDireccion: string | null;
  clienteCiudad: string | null;
  destino: string | null;
  date: string;
  piezas: DetallePieza[];
}

export function useDetalleCanalCaliente(ordenId: string) {
  return useQuery({
    queryKey: ['informes', 'canal-caliente', 'detalle', ordenId],
    queryFn: async () =>
      (await api.get<DetalleCanalCaliente>(`/informes/canal-caliente/${ordenId}`)).data,
  });
}
