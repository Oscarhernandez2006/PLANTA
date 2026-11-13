import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CostoGanadoMetodo, TarifaBase } from '@prisma/client';

// ---- Precios ----

export class CrearListaPreciosDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  nombre!: string;

  @IsDateString()
  vigenteDesde!: string;

  @IsOptional()
  @IsUUID()
  clienteId?: string;

  /** Lista de la que se copian los precios (si no, todos en cero). */
  @IsOptional()
  @IsUUID()
  copiarDeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  observaciones?: string;
}

export class EditarListaPreciosDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  nombre?: string;

  @IsOptional()
  @IsDateString()
  vigenteDesde?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  observaciones?: string;
}

export class PrecioDto {
  @IsOptional()
  @IsUUID()
  productId?: string;

  /** Alternativa a productId (carga desde Excel). */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  codigo?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  precioKg!: number;
}

export class GuardarPreciosDto {
  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => PrecioDto)
  precios!: PrecioDto[];
}

// ---- Tarifas ----

export const CATEGORIAS_TARIFA = [
  'desposte',
  'inyeccion',
  'porcionado',
  'empaque',
  'caja',
  'bolsa',
  'termoformado',
  'etiqueta',
  'servicio',
] as const;

export class CrearTarifaDto {
  @IsOptional()
  @IsUUID()
  clienteId?: string;

  @IsIn(CATEGORIAS_TARIFA)
  categoria!: (typeof CATEGORIAS_TARIFA)[number];

  @IsString()
  @MinLength(2)
  @MaxLength(60)
  concepto!: string;

  @IsEnum(TarifaBase)
  base!: TarifaBase;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  valor!: number;

  @IsDateString()
  vigenteDesde!: string;
}

export class DesactivarTarifaDto {
  @IsOptional()
  @IsUUID()
  clienteId?: string;

  @IsString()
  @MaxLength(60)
  concepto!: string;
}

export class QueryTarifasDto {
  @IsOptional()
  @IsUUID()
  clienteId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  concepto?: string;
}

// ---- Reglas por corte ----

export class ReglaCorteDto {
  @IsUUID()
  productId!: string;

  @IsBoolean()
  retoma!: boolean;

  @IsBoolean()
  piking!: boolean;

  @IsBoolean()
  congelacion!: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  kgCongelados?: number | null;
}

export class GuardarReglasDto {
  @IsOptional()
  @IsUUID()
  clienteId?: string;

  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => ReglaCorteDto)
  reglas!: ReglaCorteDto[];
}

export class QueryClienteOpcionalDto {
  @IsOptional()
  @IsUUID()
  clienteId?: string;
}

// ---- Servicios manuales ----

export class ServicioManualDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  concepto!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  cantidad!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  valorUnitario?: number | null;
}

export class GuardarServiciosDto {
  @IsOptional()
  @IsUUID()
  productionOrderId?: string;

  @IsOptional()
  @IsUUID()
  transferOrderId?: string;

  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ServicioManualDto)
  servicios!: ServicioManualDto[];
}

export class QueryServiciosDto {
  @IsOptional()
  @IsUUID()
  productionOrderId?: string;

  @IsOptional()
  @IsUUID()
  transferOrderId?: string;
}

// ---- Costo de ganado ----

export class GuardarCostoGanadoDto {
  @IsEnum(CostoGanadoMetodo)
  metodo!: CostoGanadoMetodo;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  valorUnitario!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  pesoFincaKg?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  proveedor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  referencia?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  observaciones?: string;
}
