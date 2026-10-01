import { IsEnum, IsOptional } from 'class-validator';
import { PesoCamionStatus } from '@prisma/client';

export class QueryPesoCamionDto {
  @IsOptional()
  @IsEnum(PesoCamionStatus)
  status?: PesoCamionStatus;

  /** Estado en Peso en Pie (si viene, se filtra por este en vez de `status`). */
  @IsOptional()
  @IsEnum(PesoCamionStatus)
  pieStatus?: PesoCamionStatus;
}
