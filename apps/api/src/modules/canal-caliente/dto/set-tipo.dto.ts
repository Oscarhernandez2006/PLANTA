import { IsEnum } from 'class-validator';
import { CanalTipo } from '@prisma/client';

export class SetTipoDto {
  @IsEnum(CanalTipo)
  tipo!: CanalTipo;
}
