import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthContext } from '../../common/auth/auth-context';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateProductionOrderDto, QueryProductionOrderDto, ReservarEtiquetaDto } from './production-order.dto';
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
    return this.service.reservarEtiqueta(user, id, dto.productId);
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
