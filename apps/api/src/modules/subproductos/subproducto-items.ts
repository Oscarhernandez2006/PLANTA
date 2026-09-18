export type SubproductoUnidad = 'unidad' | 'kg';

export interface SubproductoItemDef {
  tipo: string;
  codigo: string;
  label: string;
  unidad: SubproductoUnidad;
}

/**
 * Catálogo oficial de subproductos (códigos SIESA) que se genera como
 * checklist al caer (insensibilizarse) cada animal. Los que combinan
 * unidad/kg se registran por kilos, porque igual requieren peso.
 */
export const SUBPRODUCTO_ITEMS: SubproductoItemDef[] = [
  { tipo: 'cachete', codigo: '3002', label: 'Cachete', unidad: 'kg' },
  {
    tipo: 'chinchurria_precocida',
    codigo: '3003',
    label: 'Chinchurria precocida',
    unidad: 'kg',
  },
  { tipo: 'ojos', codigo: '3014', label: 'Ojos', unidad: 'unidad' },
  { tipo: 'regaton', codigo: '3021', label: 'Regatón', unidad: 'kg' },
  {
    tipo: 'ubres_comestible',
    codigo: '3026',
    label: 'Ubres comestible',
    unidad: 'kg',
  },
  { tipo: 'chinchurria_b', codigo: '3050', label: 'Chinchurria B', unidad: 'kg' },
  {
    tipo: 'canuta_comestible',
    codigo: '3202',
    label: 'Canuta comestible',
    unidad: 'unidad',
  },
  {
    tipo: 'carnecita_res_comestible',
    codigo: '3208',
    label: 'Carnecita res comestible',
    unidad: 'kg',
  },
  {
    tipo: 'carnecita_res_industrial',
    codigo: '3207',
    label: 'Carnecita de res industrial',
    unidad: 'kg',
  },
  {
    tipo: 'chinchurria_cruda',
    codigo: '3210',
    label: 'Chinchurria cruda',
    unidad: 'kg',
  },
  {
    tipo: 'creadillas_comestible',
    codigo: '3212',
    label: 'Creadillas x kilo comestible',
    unidad: 'kg',
  },
  {
    tipo: 'cuajos_res_comestible',
    codigo: '3213',
    label: 'Cuajos res comestible',
    unidad: 'unidad',
  },
  {
    tipo: 'desperdicio_res_comestible',
    codigo: '3217',
    label: 'Desperdicio res comestible',
    unidad: 'kg',
  },
  {
    tipo: 'esofago_res_comestible',
    codigo: '3219',
    label: 'Esófago res comestible',
    unidad: 'kg',
  },
  {
    tipo: 'fetos_res_comestible',
    codigo: '3221',
    label: 'Fetos res comestible',
    unidad: 'kg',
  },
  {
    tipo: 'ganglios_comestible',
    codigo: '3222',
    label: 'Ganglios comestible',
    unidad: 'kg',
  },
  {
    tipo: 'hueso_cabeza_res',
    codigo: '3228',
    label: 'Hueso de cabeza res',
    unidad: 'kg',
  },
  {
    tipo: 'libros_comestible',
    codigo: '3231',
    label: 'Libros comestible',
    unidad: 'unidad',
  },
  {
    tipo: 'libros_megatiendas',
    codigo: '3231',
    label: 'Libros megatiendas',
    unidad: 'unidad',
  },
  {
    tipo: 'pares_comestible',
    codigo: '3235',
    label: 'Pares comestible',
    unidad: 'kg',
  },
  { tipo: 'piel', codigo: '3238', label: 'Piel', unidad: 'kg' },
  { tipo: 'puya', codigo: '3241', label: 'Puya', unidad: 'kg' },
  {
    tipo: 'recorte_libro_comestible',
    codigo: '3243',
    label: 'Recorte libro comestible',
    unidad: 'kg',
  },
  {
    tipo: 'sangre_feto',
    codigo: '3244',
    label: 'Sangre de feto',
    unidad: 'unidad',
  },
  { tipo: 'sebo_comestible', codigo: '1', label: 'Sebo comestible', unidad: 'kg' },
  {
    tipo: 'sebo_aprovechamiento',
    codigo: '3249',
    label: 'Sebo de aprovechamiento',
    unidad: 'kg',
  },
  {
    tipo: 'tripa_ancha_cruda',
    codigo: '3250',
    label: 'Tripa ancha cruda',
    unidad: 'unidad',
  },
  {
    tipo: 'tripa_ancha_res_comestible',
    codigo: '3251',
    label: 'Tripa ancha res comestible',
    unidad: 'unidad',
  },
  {
    tipo: 'tripa_calambuco_res_comestible',
    codigo: '3252',
    label: 'Tripa calambuco res comestible',
    unidad: 'kg',
  },
  {
    tipo: 'vena_orta_res_comestible',
    codigo: '3255',
    label: 'Vena orta de res comestible',
    unidad: 'kg',
  },
  {
    tipo: 'viril_res_comestible',
    codigo: '3258',
    label: 'Viril res comestible',
    unidad: 'kg',
  },
  {
    tipo: 'viscera_roja_completa',
    codigo: '1618',
    label: 'Víscera roja de res completa',
    unidad: 'unidad',
  },
  {
    tipo: 'viscera_roja_incompleta',
    codigo: '1635',
    label: 'Víscera roja incompleta',
    unidad: 'unidad',
  },
  {
    tipo: 'visera_novillo',
    codigo: '1700',
    label: 'Víscera novillo',
    unidad: 'unidad',
  },
];

export const SUBPRODUCTO_ITEM_BY_TIPO = new Map(
  SUBPRODUCTO_ITEMS.map((item) => [item.tipo, item]),
);

