import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** Cuántos animales de la guía son de un tipo (machos, hembras…). */
export class GrupoPromediadoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  tipoAnimal!: string;

  @IsInt()
  @Min(1)
  cantidad!: number;
}

export class PromediarGuiaDto {
  // Guía de Peso en Camión: de ahí salen el neto y la cantidad de animales.
  @IsUUID()
  pesoCamionId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  corral!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  tipoAnimal!: string;

  // Guía mixta: reparte los animales pendientes por tipo; la suma debe ser igual a los pendientes.
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GrupoPromediadoDto)
  grupos?: GrupoPromediadoDto[];
}
