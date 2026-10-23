import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/** Una fila de la hoja BENEFICIO (solo las columnas que se digitan). */
export class SaveHistoricoBeneficioDto {
  @IsDateString()
  fecha!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  proveedor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  firmador?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  cliente?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  granja?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  municipio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  guiaIca?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  lote?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  novillo?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  novilla?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  vaca?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  toro?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  bufalo?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  pieles?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  pesoPieKg?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  pesoCalienteKg?: number;
}
