import { IsNumber, IsPositive, Max } from 'class-validator';

export class RepesarAnimalDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(9_999_999)
  pesoKg!: number;
}
