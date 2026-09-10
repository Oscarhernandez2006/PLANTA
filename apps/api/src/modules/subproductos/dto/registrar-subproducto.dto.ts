import { IsIn, IsNumber, IsPositive, IsUUID, Max } from 'class-validator';

export type TipoViscera = 'blancas' | 'rojas';

export class RegistrarSubproductoDto {
  @IsUUID()
  eventoId!: string;

  @IsIn(['blancas', 'rojas'])
  tipo!: TipoViscera;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(9999)
  pesoKg!: number;
}
