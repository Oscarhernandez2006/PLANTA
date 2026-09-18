import {
  ArrayNotEmpty,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

const CATEGORIAS_VALIDAS = [
  'retoma',
  'viscera_blanca',
  'viscera_roja',
  'cabeza_patas',
];

export class AsignarCavaDto {
  @IsUUID('4', { each: true })
  @ArrayNotEmpty()
  ordenBeneficioIds!: string[];

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  cava!: string;

  // Si se indica, solo asigna la cava a los subproductos de esa categoría.
  @IsOptional()
  @IsIn(CATEGORIAS_VALIDAS)
  categoria?: string;
}
