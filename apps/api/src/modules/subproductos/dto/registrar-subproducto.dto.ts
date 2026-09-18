import {
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsUUID,
  Max,
} from 'class-validator';
import { SUBPRODUCTO_ITEMS, SUBPRODUCTO_ITEMS_CABEZA_PATAS } from '../subproducto-items';

const TIPOS_VALIDOS = [
  ...SUBPRODUCTO_ITEMS,
  ...SUBPRODUCTO_ITEMS_CABEZA_PATAS,
].map((i) => i.tipo);

export class RegistrarSubproductoDto {
  @IsUUID()
  eventoId!: string;

  @IsIn(TIPOS_VALIDOS)
  tipo!: string;

  // Solo requerido para los productos que se registran por kg (no por unidad).
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(9999)
  pesoKg?: number;
}
