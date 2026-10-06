import { CanalDispatchType, DispatchOrderStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateCanalDispatchOrderDto {
  @IsEnum(CanalDispatchType)
  tipo!: CanalDispatchType;

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

export class CodigoProductoDto {
  @IsString()
  @MaxLength(40)
  codigo!: string;
}

export class RegistrarProductoDto extends CodigoProductoDto {
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

export class QueryCanalDispatchOrderDto {
  @IsOptional()
  @IsEnum(CanalDispatchType)
  tipo?: CanalDispatchType;

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
