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

// ---- Informe de sacrificio ----

export interface InformeSacrificioRow {
  id: string;
  reference: number;
  cliente: string;
  date: string;
  status: OrdenBeneficioStatus;
  guias: string[];
  animalCount: number;
  sacrificados: number;
}

export interface SacrificioAnimal {
  sequence: number;
  turno: number;
  tipo: string | null;
  stunnedAt: string;
  /** Peso en pie (kg). */
  pepKg: number | null;
  /** Peso en caliente (kg). */
  pecKg: number | null;
  pielKg: number | null;
  /** PEC ÷ PEP × 100. */
  rendimiento: number | null;
}

export interface DetalleSacrificio {
  id: string;
  reference: number;
  date: string;
  status: OrdenBeneficioStatus;
  cliente: string;
  clienteNit: string | null;
  guias: string[];
  finca: string | null;
  animalCount: number;
  animales: SacrificioAnimal[];
  totales: {
    animales: number;
    pepKg: number;
    pecKg: number;
    pielKg: number;
    rendimiento: number | null;
  };
}

export function useInformeSacrificio(hasta: string) {
  return useQuery({
    queryKey: ['informes', 'sacrificio', hasta],
    queryFn: async () =>
      (
        await api.get<InformeSacrificioRow[]>('/informes/sacrificio', { params: { hasta } })
      ).data,
  });
}

export function useDetalleSacrificio(ordenId: string) {
  return useQuery({
    queryKey: ['informes', 'sacrificio', 'detalle', ordenId],
    queryFn: async () =>
      (await api.get<DetalleSacrificio>(`/informes/sacrificio/${ordenId}`)).data,
  });
}

// ---- Informe de proceso general ----

export type InformeProcesoRow = InformeSacrificioRow;

export interface ProcesoPieza {
  pieza: CanalPiezaTipo;
  pesoKg: number;
  turno: number | null;
  weighedAt: string;
  operario: string | null;
  bodega: string | null;
  cava: string | null;
  destino: string | null;
  observaciones: string | null;
  traslados: number;
  /** OD000001 / DC000001 (caliente) o null si no se ha despachado. */
  despacho: string | null;
}

export interface ProcesoAnimal {
  sequence: number;
  turno: number;
  pie: {
    reference: number;
    bpReference: number;
    corral: string | null;
    sexo: string | null;
    tipoPesaje: 'individual' | 'promediado';
    pesoInicialKg: number;
    pesoActualKg: number;
    mermaKg: number;
    repesajes: number;
    pesadoAt: string;
    operario: string | null;
    observaciones: string | null;
  } | null;
  sacrificio: { at: string; operario: string | null };
  piel: { kg: number | null; at: string | null; operario: string | null };
  canal: {
    tipoAnimal: CanalAnimalTipo | null;
    canalTipo: CanalTipo | null;
    conCola: boolean | null;
    expendio: string | null;
    piezas: ProcesoPieza[];
    pecKg: number | null;
  };
  subproductos: { registrados: number; kg: number };
  rendimiento: number | null;
}

export interface DetalleProceso {
  orden: {
    id: string;
    reference: number;
    date: string;
    status: OrdenBeneficioStatus;
    cliente: string;
    clienteNit: string | null;
    guias: string[];
    animalCount: number;
    observaciones: string | null;
    cabezasPatas: boolean;
    subproductoDestino: string;
    subproductoRetiroAt: string | null;
    subproductoRetiroPor: string | null;
    subproductoRetiroObservaciones: string | null;
    creadaPor: string | null;
    createdAt: string;
  };
  guia: {
    guia: string | null;
    bcReference: number;
    date: string;
    procedencia: string | null;
    proveedor: string | null;
    cliente: string | null;
    placa: string | null;
    conductor: string | null;
    cantidad: number | null;
    entradaKg: number | null;
    salidaKg: number | null;
    netoKg: number | null;
    promedioKg: number | null;
    estadoCamion: 'abierta' | 'cerrada';
    estadoPie: 'abierta' | 'cerrada';
    observaciones: string | null;
    registradaPor: string | null;
    createdAt: string;
  } | null;
  pie: {
    bpReference: number;
    animales: number;
    tiposPesaje: string[];
    pesoInicialKg: number;
    pesoActualKg: number;
    mermaRepesajeKg: number;
    repesajes: number;
    diferenciaVsNetoKg: number | null;
    corrales: string[];
  } | null;
  animales: ProcesoAnimal[];
  subproductos: {
    tipo: string;
    codigo: string;
    producto: string;
    unidad: string;
    categoria: string;
    unidades: number;
    kg: number;
    animales: number;
  }[];
  totales: {
    animales: number;
    sacrificados: number;
    conCanal: number;
    conPiel: number;
    pepKg: number;
    pecKg: number;
    pielKg: number;
    rendimiento: number | null;
    piezasCanal: number;
    piezasDespachadas: number;
    subproductosKg: number;
  };
}

export function useInformeProceso(hasta: string) {
  return useQuery({
    queryKey: ['informes', 'proceso-general', hasta],
    queryFn: async () =>
      (
        await api.get<InformeProcesoRow[]>('/informes/proceso-general', { params: { hasta } })
      ).data,
  });
}

export function useDetalleProceso(ordenId: string) {
  return useQuery({
    queryKey: ['informes', 'proceso-general', 'detalle', ordenId],
    queryFn: async () =>
      (await api.get<DetalleProceso>(`/informes/proceso-general/${ordenId}`)).data,
  });
}
