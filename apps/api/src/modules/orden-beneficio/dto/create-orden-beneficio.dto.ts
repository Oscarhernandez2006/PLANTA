import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { OrdenBeneficioStatus, SubproductoDestino } from '@prisma/client';

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

  // Si no se envía, se asignan todos los animales disponibles de la guía.
  @IsOptional()
  @IsInt()
  @Min(1)
  animalCount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observaciones?: string;

  // Estado inicial del lote (por defecto pendiente).
  @IsOptional()
  @IsEnum(OrdenBeneficioStatus)
  status?: OrdenBeneficioStatus;

  // Quién se queda con las vísceras del lote (todas: rojas y blancas).
  @IsOptional()
  @IsEnum(SubproductoDestino)
  subproductoDestino?: SubproductoDestino;

  // Si el lote requiere tiquete de cabeza y patas por animal al insensibilizar.
  @IsOptional()
  @IsBoolean()
  cabezasPatas?: boolean;
}
