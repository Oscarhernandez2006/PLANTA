import { IsInt, Min } from 'class-validator';

export class StunDto {
  // Número del animal (tarjeta A01, A02…) que se sacrifica. Es obligatorio:
  // el operario escoge el orden en que tumba los animales.
  @IsInt({ message: 'Selecciona el animal que vas a sacrificar.' })
  @Min(1)
  sequence!: number;
}
