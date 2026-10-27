import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsPositive, IsString, Max, MaxLength, MinLength } from 'class-validator';

export class AddDispatchItemDto {
  @IsString()
  @MinLength(3)
  @MaxLength(40)
  barcode!: string;

  /** Peso en frío tomado de la báscula antes de pistolear: se guarda con la canal. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(2000)
  despachoKg?: number;
}

export class PesarDispatchItemDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(2000)
  despachoKg!: number;
}
