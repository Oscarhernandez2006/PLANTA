import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateProcedenciaDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  concepto!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  rspp?: string;
}
