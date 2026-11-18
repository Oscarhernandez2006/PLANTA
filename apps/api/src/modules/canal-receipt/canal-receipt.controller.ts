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
import { CreateCanalReceiptDto } from './dto/create-canal-receipt.dto';
import {
  CreateCanalReceiptItemDto,
  PinSupervisorDto,
  ReimpresionReciboDto,
} from './dto/create-canal-receipt-item.dto';
import { QueryCanalReceiptDto } from './dto/query-canal-receipt.dto';
import { CanalReceiptService } from './canal-receipt.service';

@UseGuards(JwtAuthGuard)
@Controller('canal-receipts')
export class CanalReceiptController {
  constructor(private readonly service: CanalReceiptService) {}

  @Get('next-number')
  nextNumber(@CurrentUser() user: AuthContext) {
    return this.service.nextNumber(user);
  }

  @Post()
  create(
    @CurrentUser() user: AuthContext,
    @Body() dto: CreateCanalReceiptDto,
  ) {
    return this.service.create(user, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthContext,
    @Query() query: QueryCanalReceiptDto,
  ) {
    return this.service.findAll(user, query);
  }

  @Delete('items/:itemId')
  deleteItem(
    @CurrentUser() user: AuthContext,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: PinSupervisorDto,
  ) {
    return this.service.deleteItem(user, itemId, dto.pin);
  }

  @Post('items/:itemId/reimpresion')
  reimpresion(
    @CurrentUser() user: AuthContext,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: ReimpresionReciboDto,
  ) {
    return this.service.registrarReimpresion(user, itemId, dto.estacion);
  }

  @Patch(':id/cerrar')
  cerrar(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PinSupervisorDto,
  ) {
    return this.service.cerrar(user, id, dto.pin);
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
    @Body() dto: CreateCanalReceiptItemDto,
  ) {
    return this.service.addItem(user, id, dto);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.findOne(user, id);
  }
}
