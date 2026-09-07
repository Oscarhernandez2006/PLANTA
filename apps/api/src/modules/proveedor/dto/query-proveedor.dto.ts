import { IsOptional, IsString, MaxLength } from 'class-validator';

export class QueryProveedorDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}
