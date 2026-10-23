import { IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

/** Tarifa de sacrificio (hoja TARIFAS, tabla CLIENTE / VALOR BASE). */
export class SaveTarifaSacrificioDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  cliente!: string;

  @IsNumber()
  @Min(0)
  valorBase!: number;
}

/** Tarifa de subproductos retomados (hoja TARIFAS, tabla CLIENTES). */
export class SaveTarifaSubproductoDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  cliente!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cabezas?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  despojos?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  libros?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  pieles?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sebo?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  viscerasRojas?: number;
}
