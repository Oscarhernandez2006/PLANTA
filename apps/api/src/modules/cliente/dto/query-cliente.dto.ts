import { IsOptional, IsString, MaxLength } from 'class-validator';

export class QueryClienteDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}
