import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class AgregarPickingDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  codigo!: string;
}

/** Peso del arrume en la báscula y sus taras (tara total = tara canastilla × canastillas + estiba). */
export class PesoArrumeDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(999999)
  pesoBrutoKg!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99)
  taraCanastillaKg!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999)
  taraEstibaKg?: number;
}

export class AgregarArrumeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  codigo!: string;

  /** Clave del supervisor para meter una etiqueta que no está en el picking. */
  @IsOptional()
  @Matches(/^\d{4,12}$/, { message: 'La clave del supervisor no es válida.' })
  pin?: string;

  /** Despacho posta: pre-orden (tienda) a la que va una etiqueta que entró con PIN. */
  @IsOptional()
  @IsUUID()
  pickingId?: string;
}

export class AutorizarCierreDto {
  @IsString()
  @Matches(/^\d{4,12}$/, { message: 'La clave del supervisor no es válida.' })
  pin!: string;
}

export class LineaPreordenDto {
  @IsUUID()
  productoId!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(999999)
  kgPedidos!: number;
}

/** Pre-orden manual: tienda y orden de compra opcionales, kilos pedidos por producto. */
export class GuardarPreordenDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  ocNumero?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  tiendaCodigo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  tiendaNombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observaciones?: string;

  @IsArray()
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => LineaPreordenDto)
  lineas!: LineaPreordenDto[];
}

/** Fila del Excel de órdenes de compra del cliente (Dep, Dep Desc, Orden, Plu, Producto, Pedido). */
export class FilaOrdenCompraDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  tiendaCodigo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  tiendaNombre?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  ocNumero!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  plu!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  producto?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(999999)
  kgPedidos!: number;
}

export class MapeoPluDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  plu!: string;

  @IsUUID()
  productoId!: string;
}

export class ImportarOrdenesCompraDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => FilaOrdenCompraDto)
  filas!: FilaOrdenCompraDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => MapeoPluDto)
  mapeos?: MapeoPluDto[];
}