import { IsOptional, IsString, MaxLength } from 'class-validator';

export class QueryProcedenciaDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}
