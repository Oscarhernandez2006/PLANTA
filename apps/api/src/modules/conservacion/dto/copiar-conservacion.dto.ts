import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class CopiarConservacionDto {
  @IsUUID()
  origenId!: string;

  /** Reemplaza los productos que el cliente destino ya tenía configurados. */
  @IsOptional()
  @IsBoolean()
  sobrescribir?: boolean;
}
