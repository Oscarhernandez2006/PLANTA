import { IsEnum, IsNumber, IsOptional, IsPositive, IsUUID, Max } from 'class-validator';
import { SubproductoItemTipo } from '@prisma/client';

export class RegistrarSubproductoDto {
  @IsUUID()
  eventoId!: string;

  @IsEnum(SubproductoItemTipo)
  tipo!: SubproductoItemTipo;

  // Solo requerido para la tripa ancha (se registra por kg, no por unidad).
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(9999)
  pesoKg?: number;
}
