import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { CanalAnimalTipo } from '@prisma/client';

export class ClasificarAnimalDto {
  @IsOptional()
  @IsEnum(CanalAnimalTipo)
  tipo?: CanalAnimalTipo;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  bodega?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  cava?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  destino?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observaciones?: string;
}
