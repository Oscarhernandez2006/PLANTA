import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateOrdenBeneficioDto {
  @IsOptional()
  @IsString()
  date?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  cliente!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observaciones?: string;
}
