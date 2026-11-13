import { DispatchOrderStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
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
