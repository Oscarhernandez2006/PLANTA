import { DispatchOrderStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
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
} from 'class-validator';

export class CreateConditioningOrderDto {
  @IsUUID()
  clienteId!: string;

  @IsUUID()
  transferOrderId!: string;

  @IsDateString()
  registrationDate!: string;

  @IsDateString()
  processDate!: string;

  @IsOptional()
  @IsEnum(DispatchOrderStatus)
  status?: DispatchOrderStatus;
}

const texto = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class CrearEtiquetaAcondDto {
  @IsUUID()
  productId!: string;

  @IsUUID()
  tiendaId!: string;

  @IsOptional()
  @IsUUID()
  bodegaId?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999)
  taraKg!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999)
  brutoKg!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(999999)
  netoKg!: number;

  @IsIn(['A GRANEL', 'AL VACIO'])
  empaque!: string;

  @IsIn(['refrigerado', 'congelado'])
  conservacion!: string;

  @IsString()
  @MaxLength(40)
  temperatura!: string;

  @IsDateString()
  fechaEmpaque!: string;

  @IsOptional()
  @IsDateString()
  fechaVencimiento?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{0,30}$/, { message: 'La referencia solo admite números.' })
  ref?: string;

  @IsOptional()
  @Transform(texto)
  @IsString()
  @MaxLength(120)
  procesadoPara?: string;

  @IsBoolean()
  impresa!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  estacion?: string;
}

export class QueryEtiquetasAcondDto {
  @IsOptional()
  @IsUUID()
  productId?: string;
}

export class BuscarEtiquetaAcondDto {
  @IsString()
  @MaxLength(40)
  codigo!: string;
}

export class QueryConditioningOrderDto {
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
