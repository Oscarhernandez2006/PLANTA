import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const mayus = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class CreatePuntoEnvioDto {
  @Transform(mayus)
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  razonSocial!: string;

  /** Vacío = sin dato. */
  @IsOptional()
  @Transform(mayus)
  @IsString()
  @MaxLength(30)
  nit?: string;

  @IsOptional()
  @Transform(mayus)
  @IsString()
  @MaxLength(60)
  telefono?: string;

  @IsOptional()
  @Transform(mayus)
  @IsString()
  @MaxLength(160)
  direccion?: string;

  @IsOptional()
  @Transform(mayus)
  @IsString()
  @MaxLength(80)
  municipio?: string;

  @IsOptional()
  @Transform(mayus)
  @IsString()
  @MaxLength(80)
  departamento?: string;
}

export class UpdatePuntoEnvioDto extends CreatePuntoEnvioDto {
  @IsOptional()
  @Transform(mayus)
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  declare razonSocial: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
