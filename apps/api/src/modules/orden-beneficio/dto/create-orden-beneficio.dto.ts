import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { SubproductoDestino } from '@prisma/client';

export class CreateOrdenBeneficioDto {
  @IsOptional()
  @IsString()
  date?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  cliente!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  guia!: string;

  @IsInt()
  @Min(1)
  animalCount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observaciones?: string;

  // Quién se queda con las vísceras del lote (todas: rojas y blancas).
  @IsOptional()
  @IsEnum(SubproductoDestino)
  subproductoDestino?: SubproductoDestino;
}
