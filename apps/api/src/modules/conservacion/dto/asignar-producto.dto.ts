import { IsUUID } from 'class-validator';
import { ActualizarConservacionDto } from './actualizar-conservacion.dto';

export class AsignarProductoDto extends ActualizarConservacionDto {
  @IsUUID()
  productId!: string;
}
