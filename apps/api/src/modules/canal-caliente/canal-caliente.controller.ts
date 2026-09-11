import {
  Body,
  Controller,
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
import { CanalCalienteService } from './canal-caliente.service';
import { SetTipoDto } from './dto/set-tipo.dto';
import { RegistrarCanalDto } from './dto/registrar-canal.dto';

@UseGuards(JwtAuthGuard)
@Controller('canal-caliente')
export class CanalCalienteController {
  constructor(private readonly service: CanalCalienteService) {}

  @Get('lotes')
  lotes(@CurrentUser() user: AuthContext, @Query('date') date?: string) {
    return this.service.lotes(user, date);
  }

  @Get('animales')
  animales(@CurrentUser() user: AuthContext, @Query('date') date?: string) {
    return this.service.animales(user, date);
  }

  @Get('piezas')
  piezas(@CurrentUser() user: AuthContext, @Query('date') date?: string) {
    return this.service.piezas(user, date);
  }

  @Get('reporte')
  reporte(@CurrentUser() user: AuthContext, @Query('date') date?: string) {
    return this.service.reporte(user, date);
  }

  @Get('lotes/:id')
  loteDetail(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.loteDetail(user, id);
  }

  @Patch('lotes/:id/tipo')
  setTipo(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetTipoDto,
  ) {
    return this.service.setTipo(user, id, dto.tipo);
  }

  @Post()
  registrar(
    @CurrentUser() user: AuthContext,
    @Body() dto: RegistrarCanalDto,
  ) {
    return this.service.registrar(user, dto);
  }

  @Post('undo/:piezaId')
  deshacer(
    @CurrentUser() user: AuthContext,
    @Param('piezaId', ParseUUIDPipe) piezaId: string,
  ) {
    return this.service.deshacer(user, piezaId);
  }
}
