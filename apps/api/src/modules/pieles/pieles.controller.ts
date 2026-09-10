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
import { PielesService } from './pieles.service';
import { RegistrarPielDto } from './dto/registrar-piel.dto';
import { RegistrarLoteDto } from './dto/registrar-lote.dto';

@UseGuards(JwtAuthGuard)
@Controller('pieles')
export class PielesController {
  constructor(private readonly service: PielesService) {}

  @Get('lotes')
  lotes(@CurrentUser() user: AuthContext, @Query('date') date?: string) {
    return this.service.lotes(user, date);
  }

  @Get('lotes/:id')
  loteDetail(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.loteDetail(user, id);
  }

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

  @Post('lote')
  registrarLote(
    @CurrentUser() user: AuthContext,
    @Body() dto: RegistrarLoteDto,
  ) {
    return this.service.registrarLote(user, dto);
  }
}
