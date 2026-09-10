import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthContext } from '../../common/auth/auth-context';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PielesService } from './pieles.service';
import { RegistrarPielDto } from './dto/registrar-piel.dto';

@UseGuards(JwtAuthGuard)
@Controller('pieles')
export class PielesController {
  constructor(private readonly service: PielesService) {}

  @Get('pendientes')
  pendientes(
    @CurrentUser() user: AuthContext,
    @Query('date') date?: string,
  ) {
    return this.service.pendientes(user, date);
  }

  @Get('pesados')
  pesados(@CurrentUser() user: AuthContext, @Query('date') date?: string) {
    return this.service.pesados(user, date);
  }

  @Post()
  registrar(@CurrentUser() user: AuthContext, @Body() dto: RegistrarPielDto) {
    return this.service.registrar(user, dto);
  }
}
