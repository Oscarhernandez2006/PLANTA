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
import { CreateOrdenBeneficioDto } from './dto/create-orden-beneficio.dto';
import { OrdenBeneficioService } from './orden-beneficio.service';

@UseGuards(JwtAuthGuard)
@Controller('orden-beneficio')
export class OrdenBeneficioController {
  constructor(private readonly service: OrdenBeneficioService) {}

  @Get('candidates')
  candidates(@CurrentUser() user: AuthContext, @Query('date') date?: string) {
    return this.service.candidates(user, date);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthContext,
    @Query('date') date?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.findAll(user, { date, from, to });
  }

  @Post()
  create(
    @CurrentUser() user: AuthContext,
    @Body() dto: CreateOrdenBeneficioDto,
  ) {
    return this.service.create(user, dto);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.findOne(user, id);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.remove(user, id);
  }
}
