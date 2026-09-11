import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsUUID,
  Max,
} from 'class-validator';
import { CanalPiezaTipo, CanalTurno } from '@prisma/client';

export class RegistrarCanalDto {
  @IsUUID()
  eventoId!: string;

  @IsEnum(CanalPiezaTipo)
  pieza!: CanalPiezaTipo;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(9999)
  pesoKg!: number;

  @IsOptional()
  @IsEnum(CanalTurno)
  turno?: CanalTurno;
}
