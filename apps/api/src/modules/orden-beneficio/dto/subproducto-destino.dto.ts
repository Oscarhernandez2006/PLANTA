import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { SubproductoDestino } from '@prisma/client';

export class SetSubproductoDestinoDto {
  @IsEnum(SubproductoDestino)
  subproductoDestino!: SubproductoDestino;
}

// Deja constancia de que el firmante retiró las vísceras del lote.
export class RegistrarRetiroDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  observaciones?: string;
}
