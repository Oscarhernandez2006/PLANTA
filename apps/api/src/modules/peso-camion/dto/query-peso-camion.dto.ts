import { IsEnum, IsOptional } from 'class-validator';
import { PesoCamionStatus } from '@prisma/client';

export class QueryPesoCamionDto {
  @IsOptional()
  @IsEnum(PesoCamionStatus)
  status?: PesoCamionStatus;
}
