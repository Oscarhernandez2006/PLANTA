import { CanalDispatchType, DispatchOrderStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CreateGuiaTransporteDto } from '../guia-transporte/guia-transporte.dto';

/** Camión (guía existente o nueva) de un despacho con remisiones por tienda. */
export class GuiaCierreDto {
  @IsOptional()
  @IsUUID()
  guiaTransporteId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateGuiaTransporteDto)
  nuevaGuia?: CreateGuiaTransporteDto;
}

/** Remisión de una tienda (pre-orden) y la posición en `guias` del camión que la lleva. */
export class RemisionCierreDto {
  @IsUUID()
  pickingId!: string;

  @IsInt()
  @Min(0)
  guia!: number;
}

/** Al cerrar: a dónde se envía y en qué guía de transporte (existente o nueva). */
export class CerrarCanalDispatchOrderDto {
  /** Vacío = se despacha al cliente de la orden. */
  @IsOptional()
  @IsUUID()
  puntoEnvioId?: string;

  @IsOptional()
  @IsUUID()
  guiaTransporteId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateGuiaTransporteDto)
  nuevaGuia?: CreateGuiaTransporteDto;

  /** Despacho posta al cliente con tiendas: camiones y qué tiendas lleva cada uno. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => GuiaCierreDto)
  guias?: GuiaCierreDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => RemisionCierreDto)
  remisiones?: RemisionCierreDto[];

  /** PIN de supervisor para cerrar con pre-órdenes sin alistar al 100 %. */
  @IsOptional()
  @Matches(/^\d{4,12}$/, { message: 'PIN no válido.' })
  pin?: string;
}

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

  /** PIN de supervisor para despachar una etiqueta que no está en el picking de la orden. */
  @IsOptional()
  @Matches(/^\d{4,12}$/, { message: 'PIN no válido.' })
  pin?: string;
}

export class RegistrarProductoDto extends CodigoProductoDto {
  /** Pre-orden (tienda) a la que va un producto que entró con PIN sin estar alistado. */
  @IsOptional()
  @IsUUID()
  pickingId?: string;

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
