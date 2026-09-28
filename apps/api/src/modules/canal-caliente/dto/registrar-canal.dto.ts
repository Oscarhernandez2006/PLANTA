import {
  IsEnum,
  IsNumber,
  IsPositive,
  IsUUID,
  Max,
} from 'class-validator';
import { CanalPiezaTipo } from '@prisma/client';

export class RegistrarCanalDto {
  @IsUUID()
  eventoId!: string;

  @IsEnum(CanalPiezaTipo)
  pieza!: CanalPiezaTipo;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(9999)
  pesoKg!: number;
}
