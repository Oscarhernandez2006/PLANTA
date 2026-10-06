import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthContext } from '../../common/auth/auth-context';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  BuscarEtiquetaAcondDto,
  CreateConditioningOrderDto,
  CrearEtiquetaAcondDto,
  QueryConditioningOrderDto,
  QueryEtiquetasAcondDto,
} from './conditioning-order.dto';
import { ConditioningOrderService } from './conditioning-order.service';

@UseGuards(JwtAuthGuard)
@Controller('conditioning-orders')
export class ConditioningOrderController {
  constructor(private readonly service: ConditioningOrderService) {}

  @Get('next-number')
  nextNumber(@CurrentUser() user: AuthContext) {
    return this.service.nextNumber(user);
  }

  @Post()
  create(@CurrentUser() user: AuthContext, @Body() dto: CreateConditioningOrderDto) {
    return this.service.create(user, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthContext, @Query() query: QueryConditioningOrderDto) {
    return this.service.findAll(user, query);
  }

  @Get('rotulado/etiqueta')
  buscarEtiqueta(@CurrentUser() user: AuthContext, @Query() query: BuscarEtiquetaAcondDto) {
    return this.service.buscarEtiqueta(user, query.codigo);
  }

  @Delete('etiquetas/:etiquetaId')
  borrarEtiqueta(
    @CurrentUser() user: AuthContext,
    @Param('etiquetaId', ParseUUIDPipe) etiquetaId: string,
  ) {
    return this.service.borrarEtiqueta(user, etiquetaId);
  }

  @Get(':id/resumen')
  resumen(@CurrentUser() user: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.resumen(user, id);
  }

  @Get(':id/etiquetas')
  etiquetas(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: QueryEtiquetasAcondDto,
  ) {
    return this.service.etiquetas(user, id, query.productId);
  }

  @Post(':id/etiquetas')
  crearEtiqueta(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CrearEtiquetaAcondDto,
  ) {
    return this.service.crearEtiqueta(user, id, dto);
  }

  @Patch(':id/cerrar')
  cerrar(@CurrentUser() user: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.cerrar(user, id);
  }
}
