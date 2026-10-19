import { IsString, Length, Matches } from 'class-validator';

export class UndoDto {
  // PIN de inicio de sesión del usuario que tumbó el último animal.
  @IsString()
  @Length(4, 12, { message: 'Ingresa el PIN de quien tumbó el animal.' })
  @Matches(/^\d+$/, { message: 'El PIN debe ser numérico.' })
  pin!: string;
}
