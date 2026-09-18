import { IsIn, IsUUID } from 'class-validator';
import { SUBPRODUCTO_ITEMS, SUBPRODUCTO_ITEMS_CABEZA_PATAS } from '../subproducto-items';

const TIPOS_VALIDOS = [
  ...SUBPRODUCTO_ITEMS,
  ...SUBPRODUCTO_ITEMS_CABEZA_PATAS,
].map((i) => i.tipo);

export class DeshacerSubproductoDto {
  @IsUUID()
  eventoId!: string;

  @IsIn(TIPOS_VALIDOS)
  tipo!: string;
}
