import { Type } from 'class-transformer';
import { IsDateString, IsNumber, IsOptional, Max, Min } from 'class-validator';

/** Rango de fechas de proceso (por defecto, el mes en curso). */
export class QueryTallerDto {
  @IsOptional()
  @IsDateString()
  desde?: string;

  @IsOptional()
  @IsDateString()
  hasta?: string;

  /** Margen objetivo (%) para el precio sugerido de acondicionamiento. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(95)
  margen?: number;
}
