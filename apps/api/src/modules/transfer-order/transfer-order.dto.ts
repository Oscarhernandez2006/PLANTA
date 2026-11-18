import { DispatchOrderStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

// Código de barras de 8 dígitos (pieza o canastilla de Rotulado).
const CODIGO = /^[1-9]\d{7}$/;

export class BuscarEtiquetaTrasladoDto {
  @IsString()
  @Matches(CODIGO, { message: 'Código de barras no válido.' })
  codigo!: string;
}

export class RegistrarTrasladoDto {
  @IsString()
  @Matches(CODIGO, { message: 'Código de barras no válido.' })
  codigo!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(999999)
  pesoKg!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999)
  taraKg!: number;
}

export class CreateTransferOrderDto {
  @IsUUID()
  clienteId!: string;

  @IsDateString()
  registrationDate!: string;

  @IsDateString()
  processDate!: string;

  @IsOptional()
  @IsEnum(DispatchOrderStatus)
  status?: DispatchOrderStatus;
}

export class QueryTransferOrderDto {
  @IsOptional()
  @IsEnum(DispatchOrderStatus)
  status?: DispatchOrderStatus;

  /** Gestor de órdenes: estado de negocio (anulada = borrada con motivo). */
  @IsOptional()
  @IsIn(['activo', 'inactivo', 'facturado', 'anulada'])
  estado?: 'activo' | 'inactivo' | 'facturado' | 'anulada';

  @IsOptional()
  @IsString()
  @MaxLength(80)
  search?: string;

  @IsOptional()
  @IsDateString()
  desde?: string;

  @IsOptional()
  @IsDateString()
  hasta?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}

export class UpdateTransferOrderDto {
  @IsOptional()
  @IsUUID()
  clienteId?: string;

  @IsOptional()
  @IsDateString()
  processDate?: string;

  @IsOptional()
  @IsIn([DispatchOrderStatus.activo, DispatchOrderStatus.inactivo])
  status?: DispatchOrderStatus;
}

export class PinSupervisorDto {
  @IsString()
  @Matches(/^\d{4,12}$/, { message: 'PIN no válido.' })
  pin!: string;
}

export class AnularTransferOrderDto extends PinSupervisorDto {
  @IsString()
  @MinLength(5, { message: 'Escribe el motivo de la anulación (mínimo 5 caracteres).' })
  @MaxLength(300)
  motivo!: string;
}
