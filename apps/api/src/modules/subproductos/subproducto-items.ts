import { SubproductoItemTipo } from '@prisma/client';

export type SubproductoGrupo = 'rojas' | 'blancas';
export type SubproductoUnidad = 'unidad' | 'kg';

export interface SubproductoItemDef {
  tipo: SubproductoItemTipo;
  label: string;
  grupo: SubproductoGrupo;
  unidad: SubproductoUnidad;
}

/**
 * Checklist fijo que se genera para cada animal caído: vísceras rojas y
 * blancas por unidad, salvo la tripa ancha que va por kilos.
 */
export const SUBPRODUCTO_ITEMS: SubproductoItemDef[] = [
  { tipo: 'corazon', label: 'Corazón', grupo: 'rojas', unidad: 'unidad' },
  { tipo: 'higado', label: 'Hígado', grupo: 'rojas', unidad: 'unidad' },
  { tipo: 'bofe', label: 'Bofe (pulmones)', grupo: 'rojas', unidad: 'unidad' },
  { tipo: 'rinones', label: 'Riñones', grupo: 'rojas', unidad: 'unidad' },
  { tipo: 'bazo', label: 'Bazo', grupo: 'rojas', unidad: 'unidad' },
  { tipo: 'panza', label: 'Panza', grupo: 'blancas', unidad: 'unidad' },
  { tipo: 'librillo', label: 'Librillo', grupo: 'blancas', unidad: 'unidad' },
  { tipo: 'cuajar', label: 'Cuajar', grupo: 'blancas', unidad: 'unidad' },
  {
    tipo: 'tripa_delgada',
    label: 'Tripa delgada',
    grupo: 'blancas',
    unidad: 'unidad',
  },
  {
    tipo: 'tripa_ancha',
    label: 'Tripa ancha',
    grupo: 'blancas',
    unidad: 'kg',
  },
];

export const SUBPRODUCTO_ITEM_BY_TIPO = new Map(
  SUBPRODUCTO_ITEMS.map((item) => [item.tipo, item]),
);
