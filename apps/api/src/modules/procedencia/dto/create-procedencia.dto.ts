import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateProcedenciaDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  concepto!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  rspp!: string;

  /** Ya no se pide en la interfaz; se mantiene opcional por compatibilidad. */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  nit?: string;
}
