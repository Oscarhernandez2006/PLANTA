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
import { AddDispatchItemDto, PesarDispatchItemDto } from '../dispatch-order/dto/add-dispatch-item.dto';
import {
  CodigoProductoDto,
  CreateCanalDispatchOrderDto,
  QueryCanalDispatchOrderDto,
  RegistrarProductoDto,
} from './canal-dispatch-order.dto';
import { CanalDispatchOrderService } from './canal-dispatch-order.service';
import { DespachoPostaService } from './despacho-posta.service';

@UseGuards(JwtAuthGuard)
@Controller('canal-dispatch-orders')
export class CanalDispatchOrderController {
  constructor(
    private readonly service: CanalDispatchOrderService,
    private readonly posta: DespachoPostaService,
  ) {}

  @Get('next-number')
  nextNumber(@CurrentUser() user: AuthContext) {
    return this.service.nextNumber(user);
  }

  @Post()
  create(@CurrentUser() user: AuthContext, @Body() dto: CreateCanalDispatchOrderDto) {
    return this.service.create(user, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthContext, @Query() query: QueryCanalDispatchOrderDto) {
    return this.service.findAll(user, query);
  }

  @Patch('items/:itemId')
  pesarItem(
    @CurrentUser() user: AuthContext,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: PesarDispatchItemDto,
  ) {
    return this.service.pesarItem(user, itemId, dto.despachoKg);
  }

  @Delete('items/:itemId')
  removeItem(@CurrentUser() user: AuthContext, @Param('itemId', ParseUUIDPipe) itemId: string) {
    return this.service.removeItem(user, itemId);
  }

  @Get(':id/items')
  items(@CurrentUser() user: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.items(user, id);
  }

  @Patch(':id/cerrar')
  cerrar(@CurrentUser() user: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.cerrar(user, id);
  }

  // ---- Despacho Posta: productos rotulados ----

  @Delete('productos/:itemId')
  quitarProducto(@CurrentUser() user: AuthContext, @Param('itemId', ParseUUIDPipe) itemId: string) {
    return this.posta.quitar(user, itemId);
  }

  @Get(':id/producto')
  buscarProducto(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: CodigoProductoDto,
  ) {
    return this.posta.buscar(user, id, query.codigo);
  }

  @Get(':id/productos')
  productos(@CurrentUser() user: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.posta.items(user, id);
  }

  @Post(':id/productos')
  registrarProducto(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RegistrarProductoDto,
  ) {
    return this.posta.registrar(user, id, dto);
  }

  @Post(':id/items')
  addItem(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddDispatchItemDto,
  ) {
    return this.service.addItem(user, id, dto.barcode);
  }
}
