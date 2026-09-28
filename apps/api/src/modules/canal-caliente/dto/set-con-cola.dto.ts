import { IsBoolean } from 'class-validator';

export class SetConColaDto {
  @IsBoolean()
  conCola!: boolean;
}
