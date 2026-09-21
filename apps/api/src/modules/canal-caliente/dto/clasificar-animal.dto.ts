import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { CanalAnimalTipo } from '@prisma/client';

// Clasificación por ANIMAL (especie/categoría). La bodega/cava/destino/
// observaciones ahora son por PIEZA: ver ClasificarPiezaDto.
export class ClasificarAnimalDto {
  @IsOptional()
  @IsEnum(CanalAnimalTipo)
  tipo?: CanalAnimalTipo;

  // Expendio del animal, para el presinto/etiqueta de Canal Caliente.
  @IsOptional()
  @IsString()
  @MaxLength(120)
  expendio?: string;
}
