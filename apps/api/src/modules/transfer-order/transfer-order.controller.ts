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
  AnularTransferOrderDto,
  BuscarEtiquetaTrasladoDto,
  CreateTransferOrderDto,
  PinSupervisorDto,
  QueryTransferOrderDto,
  RegistrarTrasladoDto,
  UpdateTransferOrderDto,
} from './transfer-order.dto';
import { TransferOrderService } from './transfer-order.service';

@UseGuards(JwtAuthGuard)
@Controller('transfer-orders')
export class TransferOrderController {
  constructor(private readonly service: TransferOrderService) {}

  @Get('next-number')
  nextNumber(@CurrentUser() user: AuthContext) {
    return this.service.nextNumber(user);
  }

  @Post()
  create(@CurrentUser() user: AuthContext, @Body() dto: CreateTransferOrderDto) {
    return this.service.create(user, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthContext, @Query() query: QueryTransferOrderDto) {
    return this.service.findAll(user, query);
  }

  @Delete('items/:itemId')
  quitar(@CurrentUser() user: AuthContext, @Param('itemId', ParseUUIDPipe) itemId: string) {
    return this.service.quitar(user, itemId);
  }

  @Get(':id/etiqueta')
  buscarEtiqueta(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: BuscarEtiquetaTrasladoDto,
  ) {
    return this.service.buscarEtiqueta(user, id, query.codigo);
  }

  @Get(':id/items')
  items(@CurrentUser() user: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.items(user, id);
  }

  @Post(':id/items')
  registrar(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RegistrarTrasladoDto,
  ) {
    return this.service.registrar(user, id, dto);
  }

  @Get(':id')
  detalle(@CurrentUser() user: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.detalle(user, id);
  }

  @Patch(':id')
  actualizar(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTransferOrderDto,
  ) {
    return this.service.actualizar(user, id, dto);
  }

  @Patch(':id/anular')
  anular(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AnularTransferOrderDto,
  ) {
    return this.service.anular(user, id, dto);
  }

  @Patch(':id/reabrir')
  reabrir(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PinSupervisorDto,
  ) {
    return this.service.reabrir(user, id, dto.pin);
  }

  @Patch(':id/cerrar')
  cerrar(@CurrentUser() user: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.cerrar(user, id);
  }
}
