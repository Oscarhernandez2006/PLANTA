import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateCanalReceiptItemDto {
  @IsInt()
  @Min(1, { message: 'La cava debe estar entre 1 y 5.' })
  @Max(5, { message: 'La cava debe estar entre 1 y 5.' })
  cava!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive({ message: 'El peso debe ser mayor a 0.' })
  @Max(2000)
  pesoKg!: number;

  @IsString()
  @IsNotEmpty({ message: 'La guía es obligatoria.' })
  @MaxLength(60)
  guia!: string;

  @IsString()
  @IsNotEmpty({ message: 'El lote es obligatorio.' })
  @MaxLength(60)
  lote!: string;

  @IsString()
  @IsNotEmpty({ message: 'La identificación es obligatoria.' })
  @MaxLength(60)
  identificacion!: string;
}

export class PinSupervisorDto {
  @IsString()
  @Matches(/^\d{4,12}$/, { message: 'El PIN debe tener entre 4 y 12 dígitos.' })
  pin!: string;
}

export class ReimpresionReciboDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  estacion?: string;
}
