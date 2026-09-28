import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class QueryProductDto {
  @IsOptional()
  @IsString()
  search?: string;

  /** Incluye los productos inactivos (módulo de Productos). */
  @IsOptional()
  // Se lee del objeto original: la conversión implícita volvería 'false' en true.
  @Transform(({ obj }) => obj.todos === true || obj.todos === 'true')
  @IsBoolean()
  todos?: boolean;
}
