import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthContext } from '../../common/auth/auth-context';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AgregarPickingDto, GuardarPreordenDto, ImportarOrdenesCompraDto, RegistrarArrumeDto } from './picking.dto';
import { PickingService } from './picking.service';

@UseGuards(JwtAuthGuard)
@Controller('picking')
export class PickingController {
  constructor(private readonly service: PickingService) {}

  @Delete('items/:itemId')
  quitar(@CurrentUser() user: AuthContext, @Param('itemId', ParseUUIDPipe) itemId: string) {
    return this.service.quitar(user, itemId);
  }

  @Get('preordenes/:id')
  obtenerPreorden(@CurrentUser() user: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.obtenerPreorden(user, id);
  }

  @Put('preordenes/:id')
  guardarPreorden(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GuardarPreordenDto,
  ) {
    return this.service.guardarPreorden(user, id, dto);
  }

  @Delete('preordenes/:id')
  eliminarPreorden(@CurrentUser() user: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.eliminarPreorden(user, id);
  }

  @Post('preordenes/:id/items')
  agregar(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AgregarPickingDto,
  ) {
    return this.service.agregar(user, id, dto);
  }

  @Patch('preordenes/:id/asignar')
  asignar(@CurrentUser() user: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.asignar(user, id);
  }

  @Patch('preordenes/:id/liberar')
  liberar(@CurrentUser() user: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.liberar(user, id);
  }

  @Patch('preordenes/:id/terminar')
  terminar(@CurrentUser() user: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.terminar(user, id);
  }

  @Patch('preordenes/:id/reabrir')
  reabrir(@CurrentUser() user: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.reabrir(user, id);
  }

  @Get(':tipo/:ordenId')
  obtener(
    @CurrentUser() user: AuthContext,
    @Param('tipo') tipo: string,
    @Param('ordenId', ParseUUIDPipe) ordenId: string,
  ) {
    return this.service.obtener(user, tipo, ordenId);
  }

  @Post(':tipo/:ordenId/preordenes')
  crearPreorden(
    @CurrentUser() user: AuthContext,
    @Param('tipo') tipo: string,
    @Param('ordenId', ParseUUIDPipe) ordenId: string,
    @Body() dto: GuardarPreordenDto,
  ) {
    return this.service.crearPreorden(user, tipo, ordenId, dto);
  }

  @Post(':tipo/:ordenId/importar')
  importar(
    @CurrentUser() user: AuthContext,
    @Param('tipo') tipo: string,
    @Param('ordenId', ParseUUIDPipe) ordenId: string,
    @Body() dto: ImportarOrdenesCompraDto,
  ) {
    return this.service.importar(user, tipo, ordenId, dto);
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
