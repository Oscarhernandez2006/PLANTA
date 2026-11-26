import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthContext } from '../../common/auth/auth-context';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  CreateGuiaTransporteDto,
  QueryGuiasTransporteDto,
  UpdateGuiaTransporteDto,
} from './guia-transporte.dto';
import { GuiaTransporteService } from './guia-transporte.service';

@UseGuards(JwtAuthGuard)
@Controller('guias-transporte')
export class GuiaTransporteController {
  constructor(private readonly service: GuiaTransporteService) {}

  @Get('next-number')
  nextNumber(@CurrentUser() user: AuthContext) {
    return this.service.nextNumber(user);
  }

  /** Informes de despacho: órdenes DC cerradas con su punto de envío y guía. */
  @Get('despachos')
  despachos(@CurrentUser() user: AuthContext, @Query() query: QueryGuiasTransporteDto) {
    return this.service.despachosCerrados(user, query);
  }

  @Get()
  list(@CurrentUser() user: AuthContext, @Query() query: QueryGuiasTransporteDto) {
    return this.service.list(user, query);
  }

  @Post()
  create(@CurrentUser() user: AuthContext, @Body() dto: CreateGuiaTransporteDto) {
    return this.service.create(user, dto);
  }

  @Get(':id')
  uno(@CurrentUser() user: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.uno(user, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGuiaTransporteDto,
  ) {
    return this.service.update(user, id, dto);
  }
}
