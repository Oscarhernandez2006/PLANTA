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
  @MaxLength(60)
  corral?: string;

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
  @IsString()
  @MaxLength(500)
  observaciones?: string;
}
