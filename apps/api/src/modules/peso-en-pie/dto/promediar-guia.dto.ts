import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class PromediarGuiaDto {
  // Guía de Peso en Camión: de ahí salen el neto y la cantidad de animales.
  @IsUUID()
  pesoCamionId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  corral!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  tipoAnimal!: string;
}
