// Datos temporales (mock) para ver el módulo Rotulado sin backend ni base de
// datos. Reemplazar por la API real cuando la DB esté disponible.
import type {
  Movimiento,
  RotuladoEtiqueta,
  RotuladoOrden,
  RotuladoProducto,
  Tienda,
} from './api';

const DATE = '2026-09-07';

// ---- Tiendas por cliente ----
const tiendasInvercomer: Tienda[] = [
  { codTienda: 3, nombre: 'INVERCOMER DEL CARIBE', ref: 'N/A' },
];
const tiendasAgropecuaria: Tienda[] = [
  { codTienda: 1, nombre: 'TAT', ref: 'N/A' },
];
const tiendasCarnes: Tienda[] = [
  { codTienda: 1, nombre: 'PRINCIPAL', ref: 'N/A' },
];
const tiendasOlimpica: Tienda[] = [
  { codTienda: 1, nombre: 'CD OLIMPICA', ref: 'N/A' },
];

// ---- Movimientos del reporte de desposte (orden 47883) ----
const movDesposte: Movimiento[] = [
  { codigo: '13002', producto: 'COSTILLA ESPECIAL CONG', unds: 33, peso: 579.8, movimiento: 'DEVOLUCIÓN DE M.P PRODUCCIÓN A CAVAS' },
  { codigo: '13006', producto: 'RECORTE CORRIENTE AL VACIO', unds: 13, peso: 90.35, movimiento: 'DEVOLUCIÓN DE M.P PRODUCCIÓN A CAVAS' },
  { codigo: '13008', producto: 'S/BARRIGA', unds: 3, peso: 53.25, movimiento: 'DEVOLUCIÓN DE M.P PRODUCCIÓN A CAVAS' },
  { codigo: '13010', producto: 'MORRO', unds: 3, peso: 46.5, movimiento: 'DEVOLUCIÓN DE M.P PRODUCCIÓN A CAVAS' },
  { codigo: '13015', producto: 'BARCINO', unds: 9, peso: 166.0, movimiento: 'DEVOLUCIÓN DE M.P PRODUCCIÓN A CAVAS' },
  { codigo: '13018', producto: 'JARRETE AL VACIO', unds: 15, peso: 119.55, movimiento: 'DEVOLUCIÓN DE M.P PRODUCCIÓN A CAVAS' },
  { codigo: '13019', producto: 'ESPALDILLA AL VACIO', unds: 25, peso: 95.6, movimiento: 'DEVOLUCIÓN DE M.P PRODUCCIÓN A CAVAS' },
  { codigo: '13022', producto: 'FALDA A GRANEL', unds: 5, peso: 114.2, movimiento: 'DEVOLUCIÓN DE M.P PRODUCCIÓN A CAVAS' },
  { codigo: '13024', producto: 'PALOMETA A GRANEL', unds: 8, peso: 155.0, movimiento: 'DEVOLUCIÓN DE M.P PRODUCCIÓN A CAVAS' },
  { codigo: '13026', producto: 'CHINGOLO A GRANEL', unds: 3, peso: 66.5, movimiento: 'DEVOLUCIÓN DE M.P PRODUCCIÓN A CAVAS' },
];

// ---- Movimientos del reporte de acondicionamiento (orden 47886) ----
const movAcond: Movimiento[] = [
  { empaques: 6, codigo: '12083', producto: 'CHATA* SI - 847221', unds: 18, peso: 97.45, movimiento: 'SALIDA' },
  { empaques: 1, codigo: '13133', producto: 'COLA DERES* - 916054', unds: 6, peso: 9.7, movimiento: 'SALIDA' },
  { empaques: 3, codigo: '13158', producto: 'HUESO DE COGOTE* SI - 831392', unds: 3, peso: 47.1, movimiento: 'SALIDA' },
  { codigo: '11003', producto: 'LOMO ANCHO BLOQUE', unds: 1, peso: 4.31, movimiento: 'DEVOLUCIÓN DE M.P PRODUCCIÓN A CAVAS' },
  { codigo: '11168', producto: 'LOMO ANCHO PREMIUM', unds: 17, peso: 92.82, movimiento: 'DEVOLUCIÓN DE M.P PRODUCCIÓN A CAVAS' },
];

function orden(
  id: string,
  stage: RotuladoOrden['stage'],
  lote: number,
  ordenTraslado: number,
  clientNit: string,
  clientName: string,
  tiendas: Tienda[],
  movimientos: Movimiento[] = [],
  recibidoKg: number | null = null,
): RotuladoOrden {
  return {
    id,
    stage,
    date: DATE,
    lote,
    ordenTraslado,
    clientNit,
    clientName,
    tiendas,
    movimientos,
    recibidoKg,
    status: 'abierta',
  };
}

export const MOCK_ORDENES: RotuladoOrden[] = [
  // ----- Desposte -----
  orden('ord-d-23656', 'desposte', 23656, 47883, '830505537', 'AGROPECUARIA SANTACRUZ', tiendasAgropecuaria, movDesposte, 800.0),
  orden('ord-d-23646', 'desposte', 23646, 47869, '900383385', 'INVERCOMER DEL CARIBE', tiendasInvercomer),
  orden('ord-d-23645', 'desposte', 23645, 47867, '900383385', 'INVERCOMER DEL CARIBE', tiendasInvercomer),
  orden('ord-d-23644', 'desposte', 23644, 47862, '900383385', 'INVERCOMER DEL CARIBE', tiendasInvercomer),
  orden('ord-d-23634', 'desposte', 23634, 47764, '900326452', 'CARNES SANTACRUZ SAS', tiendasCarnes),
  orden('ord-d-23602', 'desposte', 23602, 47741, '890107487', 'SUPERTIENDAS Y DROGUERIA OLIMPICA', tiendasOlimpica),
  orden('ord-d-23569', 'desposte', 23569, 47663, '830505537', 'AGROPECUARIA SANTACRUZ', tiendasAgropecuaria),
  orden('ord-d-23568', 'desposte', 23568, 47662, '890107487', 'SUPERTIENDAS Y DROGUERIA OLIMPICA', tiendasOlimpica),
  orden('ord-d-23548', 'desposte', 23548, 47611, '900383385', 'INVERCOMER DEL CARIBE', tiendasInvercomer),
  orden('ord-d-23450', 'desposte', 23450, 47401, '830505537', 'AGROPECUARIA SANTACRUZ', tiendasAgropecuaria),
  // ----- Acondicionamiento -----
  orden('ord-a-23656', 'acondicionamiento', 23656, 47886, '830505537', 'AGROPECUARIA SANTACRUZ', tiendasAgropecuaria, movAcond, 154.25),
  orden('ord-a-23646', 'acondicionamiento', 23646, 47870, '900383385', 'INVERCOMER DEL CARIBE', tiendasInvercomer),
];

function etiqueta(
  id: string,
  ordenId: string,
  stage: RotuladoEtiqueta['stage'],
  data: Partial<RotuladoEtiqueta>,
): RotuladoEtiqueta {
  return {
    id,
    ordenId,
    stage,
    codTienda: 1,
    tienda: 'TAT',
    codigoProducto: null,
    producto: null,
    fechaSacrificio: '2026-09-04',
    fechaEmpaque: '2026-09-07',
    fechaVencimiento: null,
    dias: null,
    conservacion: 'refrigerado',
    ref: null,
    empaque: null,
    tara: null,
    bruto: null,
    neto: null,
    bodega: null,
    procesadoPara: null,
    imprimir: true,
    barcode: id,
    createdAt: '2026-09-07T12:00:00.000Z',
    ...data,
  };
}

// Etiquetas iniciales por orden (clave = ordenId).
export const MOCK_ETIQUETAS: Record<string, RotuladoEtiqueta[]> = {
  'ord-d-23656': [
    etiqueta('RTDESP000001', 'ord-d-23656', 'desposte', {
      codigoProducto: '13002',
      producto: 'COSTILLA ESPECIAL CONG',
      conservacion: 'congelado',
      empaque: 'A GRANEL',
      tara: 0.2,
      bruto: 580.0,
      neto: 579.8,
    }),
    etiqueta('RTDESP000002', 'ord-d-23656', 'desposte', {
      codigoProducto: '13015',
      producto: 'BARCINO',
      empaque: 'AL VACIO',
      tara: 0.15,
      bruto: 166.15,
      neto: 166.0,
    }),
  ],
  'ord-a-23656': [
    etiqueta('RTACON000001', 'ord-a-23656', 'acondicionamiento', {
      codigoProducto: '11168',
      producto: 'LOMO ANCHO PREMIUM',
      empaque: 'AL VACIO',
      tara: 0.18,
      bruto: 93.0,
      neto: 92.82,
    }),
    etiqueta('RTACON000002', 'ord-a-23656', 'acondicionamiento', {
      codigoProducto: '11003',
      producto: 'LOMO ANCHO BLOQUE',
      conservacion: 'congelado',
      empaque: 'BLOQUE',
      tara: 0.0,
      bruto: 4.31,
      neto: 4.31,
    }),
  ],
};

// ---- Catálogo de productos ----
const materiasPrimas = [
  'ASADO DE TIRA',
  'ASADO DE TIRA AL VACIO',
  'ASADO DE TIRA TF',
  'ASAR FREIR TF',
  'ATRAVESADO',
  'ATRAVESADO AL VACIO',
  'ATRAVESADO PORCIONADO',
  'ATRAVESADO RELAJADO TF',
  'ATRAVEZADO AL VACIO X 200 GR',
  'BARCINO',
  'BARCINO AL VACIO',
  'BARCINO RELAJADO AL VACIO',
  'BARCINO TF',
  'BATATA A GRANEL',
  'BATATA AL VACIO',
  'BIFE DE PALETA',
  'COSTILLA ESPECIAL CONG',
  'CHINGOLO A GRANEL',
  'ESPALDILLA AL VACIO',
  'FALDA A GRANEL',
  'JARRETE AL VACIO',
  'LOMO ANCHO BLOQUE',
  'LOMO ANCHO PREMIUM',
  'MORRO',
  'PALOMETA A GRANEL',
  'RECORTE CORRIENTE AL VACIO',
  'S/BARRIGA',
];
const subproductos = [
  'CHATA',
  'COLA DE RES',
  'HUESO DE COGOTE',
  'HUESO CARNUDO',
  'SEBO EN RAMA',
];
const terminados = [
  'CHORIZO ANTIOQUEÑO',
  'HAMBURGUESA X 4',
  'CARNE MOLIDA X 500 GR',
  'GOULASH AL VACIO',
];

export const MOCK_PRODUCTOS: RotuladoProducto[] = [
  ...materiasPrimas.map((nombre, i) => ({
    id: `mp-${i}`,
    categoria: 'materia_prima' as const,
    codigo: null,
    nombre,
  })),
  ...subproductos.map((nombre, i) => ({
    id: `sp-${i}`,
    categoria: 'subproducto' as const,
    codigo: null,
    nombre,
  })),
  ...terminados.map((nombre, i) => ({
    id: `tp-${i}`,
    categoria: 'terminado' as const,
    codigo: null,
    nombre,
  })),
];
