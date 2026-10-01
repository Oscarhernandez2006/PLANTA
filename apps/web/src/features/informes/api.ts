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

// ---- Informe de producción ----

export type EstadoOP = 'activo' | 'inactivo' | 'facturado';

export interface InformeProduccionRow {
  id: string;
  opNumber: number;
  odNumber: number;
  clienteId: string;
  cliente: string;
  clienteNit: string | null;
  processDate: string;
  status: EstadoOP;
}

export interface DetalleProduccion extends InformeProduccionRow {
  productoTerminado: string | null;
  fechaSacrificio: string | null;
  fechaIngreso: string | null;
  detalle: { codigo: string; producto: string; piezas: number; kg: number }[];
  /** Canastillas etiquetadas en Rotulado Desposte (una fila por canastilla). */
  etiquetado: {
    codigo: string;
    producto: string;
    tiendaCodigo: string;
    tienda: string;
    canastilla: number | null;
    unds: number;
    sobrantes: number;
    kg: number;
    rendimiento: number;
  }[];
}

export function useInformeProduccion(hasta: string) {
  return useQuery({
    queryKey: ['informes', 'produccion', hasta],
    queryFn: async () =>
      (
        await api.get<InformeProduccionRow[]>('/informes/produccion', { params: { hasta } })
      ).data,
  });
}

export function useDetalleProduccion(opId: string) {
  return useQuery({
    queryKey: ['informes', 'produccion', 'detalle', opId],
    queryFn: async () =>
      (await api.get<DetalleProduccion>(`/informes/produccion/${opId}`)).data,
  });
}
