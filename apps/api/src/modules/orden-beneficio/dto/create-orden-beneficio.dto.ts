import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateOrdenBeneficioDto {
  @IsOptional()
  @IsString()
  date?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  cliente!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  guia!: string;

  @IsInt()
  @Min(1)
  animalCount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observaciones?: string;
}
