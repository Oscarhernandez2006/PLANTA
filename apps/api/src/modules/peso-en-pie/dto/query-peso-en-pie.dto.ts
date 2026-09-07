import { IsEnum, IsOptional } from 'class-validator';
import { PesoEnPieStatus } from '@prisma/client';

export class QueryPesoEnPieDto {
  @IsOptional()
  @IsEnum(PesoEnPieStatus)
  status?: PesoEnPieStatus;
}
