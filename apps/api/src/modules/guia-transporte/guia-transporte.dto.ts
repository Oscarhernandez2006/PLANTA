import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const mayus = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export class CreateGuiaTransporteDto {
  /** Vacío = hoy (día de planta). */
  @IsOptional()
  @IsDateString()
  fecha?: string;

  @Transform(mayus)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  tipoVehiculo!: string;

  @Transform(mayus)
  @IsString()
  @MinLength(3)
  @MaxLength(12)
  placa!: string;

  @Transform(mayus)
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  conductor!: string;

  @IsOptional()
  @Transform(mayus)
  @IsString()
  @MaxLength(20)
  cedula?: string;

  @IsOptional()
  @Transform(mayus)
  @IsString()
  @MaxLength(500)
  observacion?: string;
}

export class UpdateGuiaTransporteDto {
  @IsOptional()
  @IsDateString()
  fecha?: string;

  @IsOptional()
  @Transform(mayus)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  tipoVehiculo?: string;

  @IsOptional()
  @Transform(mayus)
  @IsString()
  @MinLength(3)
  @MaxLength(12)
  placa?: string;

  @IsOptional()
  @Transform(mayus)
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  conductor?: string;

  @IsOptional()
  @Transform(mayus)
  @IsString()
  @MaxLength(20)
  cedula?: string;

  @IsOptional()
  @Transform(mayus)
  @IsString()
  @MaxLength(500)
  observacion?: string;
}

export class QueryGuiasTransporteDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  buscar?: string;

  @IsOptional()
  @Matches(FECHA)
  desde?: string;

  @IsOptional()
  @Matches(FECHA)
  hasta?: string;
}
