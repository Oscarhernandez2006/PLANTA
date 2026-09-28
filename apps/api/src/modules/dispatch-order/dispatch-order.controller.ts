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
import { AddDispatchItemDto, PesarDispatchItemDto } from './dto/add-dispatch-item.dto';
import { CreateDispatchOrderDto } from './dto/create-dispatch-order.dto';
import { QueryDispatchOrderDto } from './dto/query-dispatch-order.dto';
import { DispatchOrderService } from './dispatch-order.service';

@UseGuards(JwtAuthGuard)
@Controller('dispatch-orders')
export class DispatchOrderController {
  constructor(private readonly service: DispatchOrderService) {}

  @Get('next-number')
  nextNumber(@CurrentUser() user: AuthContext) {
    return this.service.nextNumber(user);
  }

  @Post()
  create(
    @CurrentUser() user: AuthContext,
    @Body() dto: CreateDispatchOrderDto,
  ) {
    return this.service.create(user, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthContext,
    @Query() query: QueryDispatchOrderDto,
  ) {
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
  removeItem(
    @CurrentUser() user: AuthContext,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    return this.service.removeItem(user, itemId);
  }

  @Get(':id/items')
  items(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.items(user, id);
  }

  @Post(':id/items')
  addItem(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddDispatchItemDto,
  ) {
    return this.service.addItem(user, id, dto.barcode);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.findOne(user, id);
  }
}
