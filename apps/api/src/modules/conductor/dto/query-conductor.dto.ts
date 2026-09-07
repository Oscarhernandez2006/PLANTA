import { IsOptional, IsString, MaxLength } from 'class-validator';

export class QueryConductorDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}
