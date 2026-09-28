import { Type } from 'class-transformer';
import { IsNumber, IsPositive, IsString, Max, MaxLength, MinLength } from 'class-validator';

export class AddDispatchItemDto {
  @IsString()
  @MinLength(3)
  @MaxLength(40)
  barcode!: string;
}

export class PesarDispatchItemDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(2000)
  despachoKg!: number;
}
