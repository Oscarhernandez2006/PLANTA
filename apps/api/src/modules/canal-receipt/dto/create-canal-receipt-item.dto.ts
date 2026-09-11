import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateCanalReceiptItemDto {
  @IsInt()
  @Min(1)
  cava!: number;

  @IsNumber()
  @Min(0)
  pesoKg!: number;

  @IsOptional()
  @IsString()
  guia?: string;

  @IsOptional()
  @IsString()
  lote?: string;

  @IsOptional()
  @IsString()
  identificacion?: string;
}
