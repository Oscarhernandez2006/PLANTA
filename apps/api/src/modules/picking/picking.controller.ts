import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthContext } from '../../common/auth/auth-context';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AgregarPickingDto, RegistrarArrumeDto } from './picking.dto';
import { PickingService } from './picking.service';

@UseGuards(JwtAuthGuard)
@Controller('picking')
export class PickingController {
  constructor(private readonly service: PickingService) {}

  @Delete('items/:itemId')
  quitar(@CurrentUser() user: AuthContext, @Param('itemId', ParseUUIDPipe) itemId: string) {
    return this.service.quitar(user, itemId);
  }

  @Get(':tipo/:ordenId')
  obtener(
    @CurrentUser() user: AuthContext,
    @Param('tipo') tipo: string,
    @Param('ordenId', ParseUUIDPipe) ordenId: string,
  ) {
    return this.service.obtener(user, tipo, ordenId);
  }

  @Post(':tipo/:ordenId/items')
  agregar(
    @CurrentUser() user: AuthContext,
    @Param('tipo') tipo: string,
    @Param('ordenId', ParseUUIDPipe) ordenId: string,
    @Body() dto: AgregarPickingDto,
  ) {
    return this.service.agregar(user, tipo, ordenId, dto);
  }

  @Patch(':tipo/:ordenId/terminar')
  terminar(
    @CurrentUser() user: AuthContext,
    @Param('tipo') tipo: string,
    @Param('ordenId', ParseUUIDPipe) ordenId: string,
  ) {
    return this.service.terminar(user, tipo, ordenId);
  }

  @Patch(':tipo/:ordenId/reabrir')
  reabrir(
    @CurrentUser() user: AuthContext,
    @Param('tipo') tipo: string,
    @Param('ordenId', ParseUUIDPipe) ordenId: string,
  ) {
    return this.service.reabrir(user, tipo, ordenId);
  }

  @Post(':tipo/:ordenId/arrume')
  arrume(
    @CurrentUser() user: AuthContext,
    @Param('tipo') tipo: string,
    @Param('ordenId', ParseUUIDPipe) ordenId: string,
    @Body() dto: RegistrarArrumeDto,
  ) {
    return this.service.arrume(user, tipo, ordenId, dto);
  }
}
