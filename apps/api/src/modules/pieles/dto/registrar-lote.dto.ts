import { IsNumber, IsPositive, IsUUID, Max } from 'class-validator';

export class RegistrarLoteDto {
  @IsUUID()
  ordenBeneficioId!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(999999)
  pesoTotalKg!: number;
}
