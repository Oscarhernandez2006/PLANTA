import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/** Una fila de la hoja RETOMAS (los totales se calculan). */
export class SaveHistoricoRetomaDto {
  @IsDateString()
  fecha!: string;

  @IsString()
  @MaxLength(160)
  firmador!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  reses?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  cabezas?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  despojos?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  libros?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  pielesKg?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  viscerasRojas?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  seboKg?: number;

  // Valores unitarios: si no se envían, se toman de la tarifa del firmador.
  @IsOptional()
  @IsNumber()
  @Min(0)
  valorCabezas?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  valorDespojos?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  valorLibros?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  valorPieles?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  valorViscerasRojas?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  valorSebo?: number;
}
