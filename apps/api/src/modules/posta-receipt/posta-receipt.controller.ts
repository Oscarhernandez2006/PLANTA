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
import { CreatePostaReceiptDto } from './dto/create-posta-receipt.dto';
import { CreatePostaReceiptItemDto } from './dto/create-posta-receipt-item.dto';
import {
  CerrarReciboDto,
  PinSupervisorDto,
  ReimpresionReciboDto,
} from '../canal-receipt/dto/create-canal-receipt-item.dto';
import { QueryPostaReceiptDto } from './dto/query-posta-receipt.dto';
import { PostaReceiptService } from './posta-receipt.service';

@UseGuards(JwtAuthGuard)
@Controller('posta-receipts')
export class PostaReceiptController {
  constructor(private readonly service: PostaReceiptService) {}

  @Get('next-number')
  nextNumber(@CurrentUser() user: AuthContext) {
    return this.service.nextNumber(user);
  }

  @Post()
  create(
    @CurrentUser() user: AuthContext,
    @Body() dto: CreatePostaReceiptDto,
  ) {
    return this.service.create(user, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthContext,
    @Query() query: QueryPostaReceiptDto,
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

  @Get(':id/destino')
  destino(@CurrentUser() user: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.destino(user, id);
  }

  @Patch(':id/cerrar')
  cerrar(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CerrarReciboDto,
  ) {
    return this.service.cerrar(user, id, dto.pin, dto.bodegaId);
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
    @Body() dto: CreatePostaReceiptItemDto,
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
