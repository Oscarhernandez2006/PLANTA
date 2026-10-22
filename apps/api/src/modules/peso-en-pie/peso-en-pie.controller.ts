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
import { SavePesoEnPieDto } from './dto/save-peso-en-pie.dto';
import { QueryPesoEnPieDto } from './dto/query-peso-en-pie.dto';
import { RepesarAnimalDto } from './dto/repesar-animal.dto';
import { PromediarGuiaDto } from './dto/promediar-guia.dto';
import { PesoEnPieService } from './peso-en-pie.service';

@UseGuards(JwtAuthGuard)
@Controller('peso-en-pie')
export class PesoEnPieController {
  constructor(private readonly service: PesoEnPieService) {}

  @Get('next-reference')
  nextReference(@CurrentUser() user: AuthContext, @Query('date') date?: string) {
    return this.service.nextReference(user, date);
  }

  @Get('bp-preview')
  bpPreview(
    @CurrentUser() user: AuthContext,
    @Query('bcReference') bcReference?: string,
    @Query('guia') guia?: string,
  ) {
    return this.service.bpPreview(
      user,
      bcReference != null ? Number(bcReference) : undefined,
      guia,
    );
  }

  @Post('promediado')
  registrarPromediado(
    @CurrentUser() user: AuthContext,
    @Body() dto: PromediarGuiaDto,
  ) {
    return this.service.registrarPromediado(user, dto);
  }

  @Post()
  create(@CurrentUser() user: AuthContext, @Body() dto: SavePesoEnPieDto) {
    return this.service.create(user, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthContext, @Query() query: QueryPesoEnPieDto) {
    return this.service.findAll(user, query.status);
  }

  @Patch('close-guide')
  closeGuide(
    @CurrentUser() user: AuthContext,
    @Query('date') date: string,
    @Query('guia') guia: string,
  ) {
    return this.service.closeGuide(user, date, guia);
  }

  @Get('guias-cerradas')
  guiasCerradas(@CurrentUser() user: AuthContext) {
    return this.service.guiasCerradas(user);
  }

  @Get('guias-cerradas/:id')
  guiaCerradaDetalle(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.guiaCerradaDetalle(user, id);
  }

  @Post('guias-cerradas/:id/repesaje')
  iniciarRepesaje(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.iniciarRepesaje(user, id);
  }

  @Post('guias-cerradas/:id/repesaje/finalizar')
  finalizarRepesaje(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.finalizarRepesaje(user, id);
  }

  @Post('repesaje/:pesoEnPieId')
  repesarAnimal(
    @CurrentUser() user: AuthContext,
    @Param('pesoEnPieId', ParseUUIDPipe) pesoEnPieId: string,
    @Body() dto: RepesarAnimalDto,
  ) {
    return this.service.repesarAnimal(user, pesoEnPieId, dto.pesoKg);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.findOne(user, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SavePesoEnPieDto,
  ) {
    return this.service.update(user, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.remove(user, id);
  }
}
