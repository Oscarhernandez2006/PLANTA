import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class QueryClienteDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  /** Módulo de Clientes: incluye inactivos y todos los datos de contacto. */
  @IsOptional()
  // Se lee del objeto original: la conversión implícita volvería 'false' en true.
  @Transform(({ obj }) => obj.todos === true || obj.todos === 'true')
  @IsBoolean()
  todos?: boolean;
}
