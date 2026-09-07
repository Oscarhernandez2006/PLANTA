import {
  Body,
  Controller,
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

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.findOne(user, id);
  }
}
