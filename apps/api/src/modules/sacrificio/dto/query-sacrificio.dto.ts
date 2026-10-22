import { IsOptional, Matches } from 'class-validator';

export class QuerySacrificioDto {
  /** Día a consultar (YYYY-MM-DD). Sin fecha: todas las órdenes activas. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Fecha inválida (AAAA-MM-DD).' })
  date?: string;
}
