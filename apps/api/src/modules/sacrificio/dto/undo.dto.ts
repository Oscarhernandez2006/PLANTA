import { IsInt, IsOptional, IsString, Length, Matches, Min } from 'class-validator';

export class UndoDto {
  // PIN de inicio de sesión del usuario que tumbó el animal a devolver.
  @IsString()
  @Length(4, 12, { message: 'Ingresa el PIN de quien tumbó el animal.' })
  @Matches(/^\d+$/, { message: 'El PIN debe ser numérico.' })
  pin!: string;

  // Número del animal en la orden (A01 = 1). Sin él, se devuelve el último caído.
  @IsOptional()
  @IsInt()
  @Min(1)
  sequence?: number;
}
