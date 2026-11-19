import { IsDateString, IsOptional, Matches } from 'class-validator';

export class QueryInformeDto {
  /** Fecha de proceso hasta la que se lista (por defecto hoy). */
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  hasta?: string;

  /** Inicio inclusivo; si se omite, conserva la ventana histórica de la consulta. */
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  desde?: string;
}
