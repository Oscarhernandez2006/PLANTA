import { IsInt, IsOptional, Min } from 'class-validator';

export class StunDto {
  // Número del animal (tarjeta A01, A02…) que se sacrifica. Si no se envía,
  // se toma el primer animal pendiente.
  @IsOptional()
  @IsInt()
  @Min(1)
  sequence?: number;
}
