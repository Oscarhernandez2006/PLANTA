import { ArrayNotEmpty, IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class AsignarCavaDto {
  @IsUUID('4', { each: true })
  @ArrayNotEmpty()
  ordenBeneficioIds!: string[];

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  cava!: string;
}
