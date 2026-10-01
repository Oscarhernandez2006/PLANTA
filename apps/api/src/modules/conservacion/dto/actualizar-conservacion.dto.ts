import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const TIPOS_CONSERVACION = ['TERMINADO', 'EN PROCESO', 'MATERIA PRIMA', 'SUBPRODUCTO'] as const;

const limpiar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class ActualizarConservacionDto {
  @IsOptional()
  @IsIn(TIPOS_CONSERVACION)
  tipo?: string;

  @IsOptional()
  @Transform(limpiar)
  @IsString()
  @MaxLength(60)
  refPluSku?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3650)
  refrigeradoDias?: number;

  @IsOptional()
  @Transform(limpiar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  refrigeradoTemp?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3650)
  congeladoDias?: number;

  @IsOptional()
  @Transform(limpiar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  congeladoTemp?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(999)
  piezasPorCanal?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(999)
  undsPorCaja?: number;
}
