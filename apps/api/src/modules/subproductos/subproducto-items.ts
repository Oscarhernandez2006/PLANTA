export type SubproductoUnidad = 'unidad' | 'kg';

// Clasificación para efectos de tiquete/precinto en Insensibilización:
// "retoma" no genera tiquete aparte; "viscera_blanca"/"viscera_roja" sí.
export type SubproductoCategoria = 'retoma' | 'viscera_blanca' | 'viscera_roja';

export interface SubproductoItemDef {
  tipo: string;
  codigo: string;
  label: string;
  unidad: SubproductoUnidad;
  categoria: SubproductoCategoria;
}

/**
 * Catálogo oficial de subproductos (códigos SIESA) que se genera como
 * checklist al caer (insensibilizarse) cada animal. Los que combinan
 * unidad/kg se registran por kilos, porque igual requieren peso.
 */
export const SUBPRODUCTO_ITEMS: SubproductoItemDef[] = [
  { tipo: 'cachete', codigo: '3002', label: 'Cachete', unidad: 'kg', categoria: 'retoma' },
  {
    tipo: 'chinchurria_precocida',
    codigo: '3003',
    label: 'Chinchurria precocida',
    unidad: 'kg',
    categoria: 'viscera_blanca',
  },
  { tipo: 'ojos', codigo: '3014', label: 'Ojos', unidad: 'unidad', categoria: 'retoma' },
  { tipo: 'regaton', codigo: '3021', label: 'Regatón', unidad: 'kg', categoria: 'viscera_blanca' },
  {
    tipo: 'ubres_comestible',
    codigo: '3026',
    label: 'Ubres comestible',
    unidad: 'kg',
    categoria: 'viscera_blanca',
  },
  {
    tipo: 'chinchurria_b',
    codigo: '3050',
    label: 'Chinchurria B',
    unidad: 'kg',
    categoria: 'viscera_blanca',
  },
  {
    tipo: 'canuta_comestible',
    codigo: '3202',
    label: 'Canuta comestible',
    unidad: 'unidad',
    categoria: 'viscera_blanca',
  },
  {
    tipo: 'carnecita_res_comestible',
    codigo: '3208',
    label: 'Carnecita res comestible',
    unidad: 'kg',
    categoria: 'retoma',
  },
  {
    tipo: 'carnecita_res_industrial',
    codigo: '3207',
    label: 'Carnecita de res industrial',
    unidad: 'kg',
    categoria: 'retoma',
  },
  {
    tipo: 'chinchurria_cruda',
    codigo: '3210',
    label: 'Chinchurria cruda',
    unidad: 'kg',
    categoria: 'viscera_blanca',
  },
  {
    tipo: 'creadillas_comestible',
    codigo: '3212',
    label: 'Creadillas x kilo comestible',
    unidad: 'kg',
    categoria: 'viscera_blanca',
  },
  {
    tipo: 'cuajos_res_comestible',
    codigo: '3213',
    label: 'Cuajos res comestible',
    unidad: 'unidad',
    categoria: 'viscera_blanca',
  },
  {
    tipo: 'desperdicio_res_comestible',
    codigo: '3217',
    label: 'Desperdicio res comestible',
    unidad: 'kg',
    categoria: 'retoma',
  },
  {
    tipo: 'esofago_res_comestible',
    codigo: '3219',
    label: 'Esófago res comestible',
    unidad: 'kg',
    categoria: 'retoma',
  },
  {
    tipo: 'fetos_res_comestible',
    codigo: '3221',
    label: 'Fetos res comestible',
    unidad: 'kg',
    categoria: 'retoma',
  },
  {
    tipo: 'ganglios_comestible',
    codigo: '3222',
    label: 'Ganglios comestible',
    unidad: 'kg',
    categoria: 'retoma',
  },
  {
    tipo: 'hueso_cabeza_res',
    codigo: '3228',
    label: 'Hueso de cabeza res',
    unidad: 'kg',
    categoria: 'retoma',
  },
  {
    tipo: 'libros_comestible',
    codigo: '3231',
    label: 'Libros comestible',
    unidad: 'unidad',
    categoria: 'viscera_blanca',
  },
  {
    tipo: 'libros_megatiendas',
    codigo: '3231',
    label: 'Libros megatiendas',
    unidad: 'unidad',
    categoria: 'viscera_blanca',
  },
  {
    tipo: 'pares_comestible',
    codigo: '3235',
    label: 'Pares comestible',
    unidad: 'kg',
    categoria: 'viscera_blanca',
  },
  { tipo: 'piel', codigo: '3238', label: 'Piel', unidad: 'kg', categoria: 'retoma' },
  { tipo: 'puya', codigo: '3241', label: 'Puya', unidad: 'kg', categoria: 'retoma' },
  {
    tipo: 'recorte_libro_comestible',
    codigo: '3243',
    label: 'Recorte libro comestible',
    unidad: 'kg',
    categoria: 'viscera_blanca',
  },
  {
    tipo: 'sangre_feto',
    codigo: '3244',
    label: 'Sangre de feto',
    unidad: 'unidad',
    categoria: 'retoma',
  },
  {
    tipo: 'sebo_comestible',
    codigo: '1',
    label: 'Sebo comestible',
    unidad: 'kg',
    categoria: 'retoma',
  },
  {
    tipo: 'sebo_aprovechamiento',
    codigo: '3249',
    label: 'Sebo de aprovechamiento',
    unidad: 'kg',
    categoria: 'retoma',
  },
  {
    tipo: 'tripa_ancha_cruda',
    codigo: '3250',
    label: 'Tripa ancha cruda',
    unidad: 'unidad',
    categoria: 'viscera_blanca',
  },
  {
    tipo: 'tripa_ancha_res_comestible',
    codigo: '3251',
    label: 'Tripa ancha res comestible',
    unidad: 'unidad',
    categoria: 'viscera_blanca',
  },
  {
    tipo: 'tripa_calambuco_res_comestible',
    codigo: '3252',
    label: 'Tripa calambuco res comestible',
    unidad: 'kg',
    categoria: 'viscera_blanca',
  },
  {
    tipo: 'vena_orta_res_comestible',
    codigo: '3255',
    label: 'Vena orta de res comestible',
    unidad: 'kg',
    categoria: 'viscera_blanca',
  },
  {
    tipo: 'viril_res_comestible',
    codigo: '3258',
    label: 'Viril res comestible',
    unidad: 'kg',
    categoria: 'retoma',
  },
  {
    tipo: 'viscera_roja_completa',
    codigo: '1618',
    label: 'Víscera roja de res completa',
    unidad: 'unidad',
    categoria: 'viscera_roja',
  },
  {
    tipo: 'viscera_roja_incompleta',
    codigo: '1635',
    label: 'Víscera roja incompleta',
    unidad: 'unidad',
    categoria: 'viscera_roja',
  },
  {
    tipo: 'visera_novillo',
    codigo: '1700',
    label: 'Víscera novillo',
    unidad: 'unidad',
    categoria: 'viscera_blanca',
  },
  // Pendientes de código SIESA (el usuario los agregó sin código; ajustar
  // en cuanto se confirme el código real de cada uno).
  {
    tipo: 'higado',
    codigo: 'S/C',
    label: 'Hígado',
    unidad: 'unidad',
    categoria: 'viscera_roja',
  },
  {
    tipo: 'corazon',
    codigo: 'S/C',
    label: 'Corazón',
    unidad: 'unidad',
    categoria: 'viscera_roja',
  },
  {
    tipo: 'rinones',
    codigo: 'S/C',
    label: 'Riñones',
    unidad: 'unidad',
    categoria: 'viscera_roja',
  },
  {
    tipo: 'bazo_pajarilla',
    codigo: 'S/C',
    label: 'Bazo (pajarilla)',
    unidad: 'unidad',
    categoria: 'viscera_roja',
  },
  {
    tipo: 'lengua',
    codigo: 'S/C',
    label: 'Lengua',
    unidad: 'unidad',
    categoria: 'viscera_roja',
  },
];

export const SUBPRODUCTO_ITEM_BY_TIPO = new Map(
  SUBPRODUCTO_ITEMS.map((item) => [item.tipo, item]),
);

export function itemsPorCategoria(categoria: SubproductoCategoria) {
  return SUBPRODUCTO_ITEMS.filter((i) => i.categoria === categoria);
}

