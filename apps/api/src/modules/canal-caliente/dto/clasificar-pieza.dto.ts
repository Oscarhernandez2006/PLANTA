import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ClasificarPiezaDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  bodega?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  cava?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  destino?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observaciones?: string;
}
