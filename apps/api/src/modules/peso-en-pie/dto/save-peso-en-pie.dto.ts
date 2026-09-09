import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { PesoEnPieTipoPesaje } from '@prisma/client';

export class SavePesoEnPieDto {
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  guia?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  procedencia?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  proveedor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  cliente?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  placa?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  conductor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  corral?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  tipoAnimal?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  lote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  animalNo?: string;

  @IsInt()
  @Min(1)
  animalCount!: number;

  @IsOptional()
  @IsEnum(PesoEnPieTipoPesaje)
  tipoPesaje?: PesoEnPieTipoPesaje;

  @IsOptional()
  @IsNumber()
  @Min(0)
  pesoTotalKg?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  pesoPromedioKg?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  cantidad?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  entrada?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  salida?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observaciones?: string;
}
