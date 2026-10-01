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

export class CreateProductionOrderDto {
  @IsUUID()
  clienteId!: string;

  @IsUUID()
  dispatchOrderId!: string;

  @IsDateString()
  registrationDate!: string;

  @IsDateString()
  processDate!: string;

  @IsOptional()
  @IsEnum(DispatchOrderStatus)
  status?: DispatchOrderStatus;
}

export class ReservarEtiquetaDto {
  @IsUUID()
  productId!: string;

  @IsUUID()
  tiendaId!: string;

  @IsOptional()
  @IsBoolean()
  sobrante?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999)
  taraKg?: number;
}

export class EstadoRotuladoDto {
  @IsUUID()
  productId!: string;
}

export class PresenciaRotuladoDto {
  @IsUUID()
  productId!: string;

  @IsString()
  @MaxLength(80)
  estacionId!: string;

  @IsString()
  @MaxLength(80)
  estacion!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  usuario?: string;
}

export class CerrarCanastillaDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999)
  taraKg?: number;
}

const texto = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class GuardarEtiquetaDto {
  @IsUUID()
  productId!: string;

  @IsUUID()
  tiendaId!: string;

  @IsOptional()
  @IsUUID()
  bodegaId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(9999)
  pieza!: number;

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
  fechaSacrificio!: string;

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
  @IsBoolean()
  sobrante?: boolean;
}

export class QueryEtiquetasDto {
  @IsUUID()
  productId!: string;
}

export class AsignarTiendaDto {
  @IsUUID()
  tiendaId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(9999)
  cantidad!: number;
}

export class QueryProductionOrderDto {
  @IsOptional()
  @IsEnum(DispatchOrderStatus)
  status?: DispatchOrderStatus;

  /** Fecha de proceso (YYYY-MM-DD). */
  @IsOptional()
  @IsDateString()
  fecha?: string;

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
