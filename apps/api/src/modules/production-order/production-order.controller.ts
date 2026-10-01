import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthContext } from '../../common/auth/auth-context';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  AsignarTiendaDto,
  CerrarCanastillaDto,
  CreateProductionOrderDto,
  EstadoRotuladoDto,
  PresenciaRotuladoDto,
  GuardarEtiquetaDto,
  QueryEtiquetasDto,
  QueryProductionOrderDto,
  ReservarEtiquetaDto,
} from './production-order.dto';
import { ProductionOrderService } from './production-order.service';

@UseGuards(JwtAuthGuard)
@Controller('production-orders')
export class ProductionOrderController {
  constructor(private readonly service: ProductionOrderService) {}

  @Get('next-number')
  nextNumber(@CurrentUser() user: AuthContext) {
    return this.service.nextNumber(user);
  }

  @Post()
  create(@CurrentUser() user: AuthContext, @Body() dto: CreateProductionOrderDto) {
    return this.service.create(user, dto);
  }

  @Post(':id/etiquetas/reservar')
  reservarEtiqueta(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReservarEtiquetaDto,
  ) {
    return this.service.reservarEtiqueta(user, id, dto);
  }

  @Get(':id/rotulado/estado')
  estadoRotulado(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: EstadoRotuladoDto,
  ) {
    return this.service.estado(user, id, query.productId);
  }

  @Get(':id/rotulado/avance')
  avanceProductos(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.avanceProductos(user, id);
  }

  @Post(':id/rotulado/presencia')
  registrarPresencia(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PresenciaRotuladoDto,
  ) {
    return this.service.registrarPresencia(user, id, dto);
  }

  @Delete(':id/rotulado/presencia/:estacionId')
  quitarPresencia(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('estacionId') estacionId: string,
  ) {
    return this.service.quitarPresencia(user, id, estacionId);
  }

  @Post('canastillas/:canastillaId/cerrar')
  cerrarCanastilla(
    @CurrentUser() user: AuthContext,
    @Param('canastillaId', ParseUUIDPipe) canastillaId: string,
    @Body() dto: CerrarCanastillaDto,
  ) {
    return this.service.cerrarCanastilla(user, canastillaId, dto.taraKg);
  }

  @Post(':id/etiquetas')
  guardarEtiqueta(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GuardarEtiquetaDto,
  ) {
    return this.service.guardarEtiqueta(user, id, dto);
  }

  @Get(':id/etiquetas')
  listarEtiquetas(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: QueryEtiquetasDto,
  ) {
    return this.service.listarEtiquetas(user, id, query);
  }

  @Delete('etiquetas/:etiquetaId')
  borrarEtiqueta(
    @CurrentUser() user: AuthContext,
    @Param('etiquetaId', ParseUUIDPipe) etiquetaId: string,
    @Query('reabrir') reabrir?: string,
  ) {
    return this.service.borrarEtiqueta(user, etiquetaId, reabrir === 'true');
  }

  @Get(':id/preparacion')
  preparacion(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.preparacion(user, id);
  }

  @Post(':id/preparacion')
  asignarTienda(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AsignarTiendaDto,
  ) {
    return this.service.asignarTienda(user, id, dto);
  }

  @Delete('preparacion/:filaId')
  quitarTienda(
    @CurrentUser() user: AuthContext,
    @Param('filaId', ParseUUIDPipe) filaId: string,
  ) {
    return this.service.quitarTienda(user, filaId);
  }

  @Get()
  findAll(@CurrentUser() user: AuthContext, @Query() query: QueryProductionOrderDto) {
    return this.service.findAll(user, query);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(user, id);
  }
}
