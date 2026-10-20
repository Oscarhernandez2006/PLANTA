import { ArrayMaxSize, IsArray, IsBoolean, IsString, Matches, MaxLength } from 'class-validator';

export class UpdatePermisosDto {
  @IsBoolean()
  accesoTotal!: boolean;

  // Rutas del menú a las que tiene acceso (ej. "/peso-en-pie").
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  @Matches(/^\/[a-z0-9\-/]+$/, { each: true, message: 'Módulo inválido.' })
  modulos!: string[];
}
