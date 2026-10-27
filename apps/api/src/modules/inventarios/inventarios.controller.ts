import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthContext } from '../../common/auth/auth-context';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { InventariosService } from './inventarios.service';

@UseGuards(JwtAuthGuard)
@Controller('inventarios')
export class InventariosController {
  constructor(private readonly service: InventariosService) {}

  @Get('pieza')
  pieza(@CurrentUser() user: AuthContext, @Query('barcode') barcode = '') {
    return this.service.piezaPorBarcode(user, barcode);
  }

  @Get('cavas/:cava')
  cava(
    @CurrentUser() user: AuthContext,
    @Param('cava') cava: string,
    @Query('date') date?: string,
  ) {
    return this.service.cava(user, cava, date);
  }

  @Get('bodegas')
  bodegas(@CurrentUser() user: AuthContext) {
    return this.service.bodegas(user);
  }

  @Get('bodegas/:id')
  bodega(@CurrentUser() user: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.bodega(user, id);
  }

  @Get('canales/:piezaId/trazabilidad')
  trazabilidadCanal(
    @CurrentUser() user: AuthContext,
    @Param('piezaId', ParseUUIDPipe) piezaId: string,
  ) {
    return this.service.trazabilidadCanal(user, piezaId);
  }

  @Get('cavas-subproducto/:cava')
  cavaSubproducto(
    @CurrentUser() user: AuthContext,
    @Param('cava') cava: string,
    @Query('date') date?: string,
  ) {
    return this.service.cavaSubproducto(user, cava, date);
  }
}
