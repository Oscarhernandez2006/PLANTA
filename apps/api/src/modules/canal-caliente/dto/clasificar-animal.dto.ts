import { IsEnum, IsOptional } from 'class-validator';
import { CanalAnimalTipo } from '@prisma/client';

// Clasificación por ANIMAL (especie/categoría). La bodega/cava/destino/
// observaciones ahora son por PIEZA: ver ClasificarPiezaDto.
export class ClasificarAnimalDto {
  @IsOptional()
  @IsEnum(CanalAnimalTipo)
  tipo?: CanalAnimalTipo;
}
