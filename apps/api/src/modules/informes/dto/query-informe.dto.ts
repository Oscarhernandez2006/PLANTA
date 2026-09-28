import { IsDateString, IsOptional } from 'class-validator';

export class QueryInformeDto {
  /** Fecha de proceso hasta la que se lista (por defecto hoy). */
  @IsOptional()
  @IsDateString()
  hasta?: string;
}
