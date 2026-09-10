import { IsNumber, IsPositive, IsUUID, Max } from 'class-validator';

export class RegistrarPielDto {
  @IsUUID()
  eventoId!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(9999)
  pesoKg!: number;
}
