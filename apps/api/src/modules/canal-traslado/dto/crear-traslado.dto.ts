import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class CrearTrasladoDto {
  @IsUUID()
  piezaId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  cavaDestino!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  motivo!: string;
}
