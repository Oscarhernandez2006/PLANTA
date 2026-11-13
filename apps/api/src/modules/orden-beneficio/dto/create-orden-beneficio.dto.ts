import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
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

  // Animales (ids de Peso en Pie) que van en la orden. Si no se envía, se
  // asignan los disponibles de la guía en orden de pesaje.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  animalIds?: string[];

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

/**
 * Divide una guía en varias órdenes. Se indica qué animales (ids de Peso en
 * Pie) van en cada orden: `animales[i]` son los de la orden i. Todos los
 * animales disponibles de la guía deben quedar repartidos.
 * `animalCount`/`animalIds` no aplican aquí (se ignoran).
 */
export class DividirOrdenBeneficioDto extends CreateOrdenBeneficioDto {
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(100)
  @IsArray({ each: true })
  animales!: string[][];
}
