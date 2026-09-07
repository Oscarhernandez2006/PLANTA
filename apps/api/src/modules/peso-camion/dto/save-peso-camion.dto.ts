import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class SavePesoCamionDto {
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
  @MaxLength(500)
  observaciones?: string;

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
}
