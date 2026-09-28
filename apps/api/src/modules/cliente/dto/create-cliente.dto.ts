import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

const limpiar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Campos de contacto opcionales del cliente (vacío = se borra). */
export class ClienteContactoDto {
  @IsOptional()
  @Transform(limpiar)
  @IsString()
  @MaxLength(30)
  nit?: string;

  @IsOptional()
  @Transform(limpiar)
  @IsString()
  @MaxLength(160)
  direccion?: string;

  @IsOptional()
  @Transform(limpiar)
  @IsString()
  @MaxLength(40)
  telefono?: string;

  @IsOptional()
  @Transform(limpiar)
  @IsString()
  @MaxLength(80)
  ciudad?: string;

  @IsOptional()
  @Transform(limpiar)
  @IsString()
  @MaxLength(120)
  contacto?: string;

  @IsOptional()
  @Transform(limpiar)
  @IsString()
  @MaxLength(120)
  correo?: string;

  @IsOptional()
  @Transform(limpiar)
  @IsString()
  @MaxLength(40)
  celular?: string;
}

export class CreateClienteDto extends ClienteContactoDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  concepto!: string;

  /** Si ya existe un cliente con ese nombre, falla en vez de devolver el existente. */
  @IsOptional()
  @IsBoolean()
  estricto?: boolean;
}

export class UpdateClienteDto extends ClienteContactoDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  concepto?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
