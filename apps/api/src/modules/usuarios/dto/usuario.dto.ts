import { UserRole } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, Length, Matches } from 'class-validator';

const NOMBRE = { message: 'El nombre debe tener entre 3 y 120 caracteres.' };
const CEDULA = /^\d{5,15}$/;
const CEDULA_MSG = { message: 'La cédula debe ser numérica (5 a 15 dígitos).' };
const PIN = /^\d{4,12}$/;
const PIN_MSG = { message: 'El PIN debe tener entre 4 y 12 dígitos.' };

export class CreateUsuarioDto {
  @IsString()
  @Length(3, 120, NOMBRE)
  fullName!: string;

  @IsString()
  @Matches(CEDULA, CEDULA_MSG)
  documentId!: string;

  @IsEnum(UserRole, { message: 'Rol inválido.' })
  role!: UserRole;

  // PIN con el que inicia sesión (junto con la cédula).
  @IsString()
  @Matches(PIN, PIN_MSG)
  pin!: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

/** Edición: todo opcional; el PIN solo se cambia si se envía. */
export class UpdateUsuarioDto {
  @IsOptional()
  @IsString()
  @Length(3, 120, NOMBRE)
  fullName?: string;

  @IsOptional()
  @IsString()
  @Matches(CEDULA, CEDULA_MSG)
  documentId?: string;

  @IsOptional()
  @IsEnum(UserRole, { message: 'Rol inválido.' })
  role?: UserRole;

  @IsOptional()
  @IsString()
  @Matches(PIN, PIN_MSG)
  pin?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
