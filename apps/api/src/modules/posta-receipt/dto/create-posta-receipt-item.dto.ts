import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreatePostaReceiptItemDto {
  @IsUUID()
  productId!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(200)
  taraKg!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive({ message: 'El peso bruto debe ser mayor a 0.' })
  @Max(3000)
  brutoKg!: number;

  @IsInt()
  @Min(1, { message: 'Las piezas deben ser al menos 1.' })
  @Max(9999)
  piezas!: number;

  @IsInt()
  @Min(0)
  @Max(999)
  empaques!: number;

  @IsString()
  @IsNotEmpty({ message: 'El lote es obligatorio.' })
  @MaxLength(60)
  lote!: string;

  @IsIn(['refrigerado', 'congelado'], { message: 'La conservación debe ser refrigerado o congelado.' })
  conservacion!: 'refrigerado' | 'congelado';

  @IsOptional()
  @IsDateString()
  fechaSacrificio?: string;

  @IsOptional()
  @IsDateString()
  fechaVencimiento?: string;
}
