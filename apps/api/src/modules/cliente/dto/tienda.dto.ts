import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const mayus = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class CreateTiendaDto {
  @Transform(mayus)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nombre!: string;

  /** Vacío = sin dato. */
  @IsOptional()
  @Transform(mayus)
  @IsString()
  @MaxLength(160)
  direccion?: string;

  @IsOptional()
  @Transform(mayus)
  @IsString()
  @MaxLength(80)
  ciudad?: string;
}

export class UpdateTiendaDto {
  @IsOptional()
  @Transform(mayus)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nombre?: string;

  @IsOptional()
  @Transform(mayus)
  @IsString()
  @MaxLength(160)
  direccion?: string;

  @IsOptional()
  @Transform(mayus)
  @IsString()
  @MaxLength(80)
  ciudad?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
