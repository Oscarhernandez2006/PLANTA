import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthContext } from '../../common/auth/auth-context';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  CrearListaPreciosDto,
  CrearTarifaDto,
  DesactivarTarifaDto,
  EditarListaPreciosDto,
  GuardarCostoGanadoDto,
  GuardarPreciosDto,
  GuardarReglasDto,
  GuardarServiciosDto,
  QueryClienteOpcionalDto,
  QueryServiciosDto,
  QueryTarifasDto,
} from './dto/maestros.dto';
import { QueryTallerDto } from './dto/query-taller.dto';
import { MaestrosService } from './maestros.service';

@UseGuards(JwtAuthGuard)
@Controller('talleres')
export class MaestrosController {
  constructor(private readonly service: MaestrosService) {}

  @Get('precios/listas')
  listas(@CurrentUser() user: AuthContext) {
    return this.service.listas(user);
  }

  @Post('precios/listas')
  crearLista(@CurrentUser() user: AuthContext, @Body() dto: CrearListaPreciosDto) {
    return this.service.crearLista(user, dto);
  }

  @Get('precios/listas/:id')
  lista(@CurrentUser() user: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.lista(user, id);
  }

  @Patch('precios/listas/:id')
  editarLista(@CurrentUser() user: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EditarListaPreciosDto) {
    return this.service.editarLista(user, id, dto);
  }

  @Put('precios/listas/:id/precios')
  guardarPrecios(@CurrentUser() user: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: GuardarPreciosDto) {
    return this.service.guardarPrecios(user, id, dto);
  }

  @Delete('precios/listas/:id')
  eliminarLista(@CurrentUser() user: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.eliminarLista(user, id);
  }

  @Get('tarifas')
  tarifas(@CurrentUser() user: AuthContext, @Query() q: QueryTarifasDto) {
    return this.service.tarifas(user, q.clienteId);
  }

  @Get('tarifas/historial')
  historial(@CurrentUser() user: AuthContext, @Query() q: QueryTarifasDto) {
    return this.service.historialTarifa(user, q.concepto ?? '', q.clienteId);
  }

  @Post('tarifas')
  crearTarifa(@CurrentUser() user: AuthContext, @Body() dto: CrearTarifaDto) {
    return this.service.crearTarifa(user, dto);
  }

  @Post('tarifas/activo')
  desactivarTarifa(@CurrentUser() user: AuthContext, @Body() dto: DesactivarTarifaDto) {
    return this.service.desactivarTarifa(user, dto);
  }

  @Get('reglas-corte')
  reglas(@CurrentUser() user: AuthContext, @Query() q: QueryClienteOpcionalDto) {
    return this.service.reglas(user, q.clienteId);
  }

  @Put('reglas-corte')
  guardarReglas(@CurrentUser() user: AuthContext, @Body() dto: GuardarReglasDto) {
    return this.service.guardarReglas(user, dto);
  }

  @Get('servicios')
  servicios(@CurrentUser() user: AuthContext, @Query() q: QueryServiciosDto) {
    return this.service.servicios(user, q);
  }

  @Put('servicios')
  guardarServicios(@CurrentUser() user: AuthContext, @Body() dto: GuardarServiciosDto) {
    return this.service.guardarServicios(user, dto);
  }

  @Get('costo-ganado')
  costos(@CurrentUser() user: AuthContext, @Query() q: QueryTallerDto) {
    return this.service.costosGanado(user, q.desde, q.hasta);
  }

  @Put('costo-ganado/:ordenId')
  guardarCosto(
    @CurrentUser() user: AuthContext,
    @Param('ordenId', ParseUUIDPipe) ordenId: string,
    @Body() dto: GuardarCostoGanadoDto,
  ) {
    return this.service.guardarCostoGanado(user, ordenId, dto);
  }

  @Delete('costo-ganado/:ordenId')
  eliminarCosto(@CurrentUser() user: AuthContext, @Param('ordenId', ParseUUIDPipe) ordenId: string) {
    return this.service.eliminarCostoGanado(user, ordenId);
  }
}
