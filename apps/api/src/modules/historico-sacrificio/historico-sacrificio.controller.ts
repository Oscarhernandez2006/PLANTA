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
import { SaveHistoricoBeneficioDto } from './dto/save-historico-beneficio.dto';
import { HistoricoSacrificioService } from './historico-sacrificio.service';
import { HistoricoRetomasService } from './historico-retomas.service';
import { SaveHistoricoRetomaDto } from './dto/save-historico-retoma.dto';
import { HistoricoTarifasService } from './historico-tarifas.service';
import { SaveTarifaSacrificioDto, SaveTarifaSubproductoDto } from './dto/save-tarifa.dto';

@UseGuards(JwtAuthGuard)
@Controller('historico-sacrificio')
export class HistoricoSacrificioController {
  constructor(
    private readonly service: HistoricoSacrificioService,
    private readonly retomasService: HistoricoRetomasService,
    private readonly tarifasService: HistoricoTarifasService,
  ) {}

  @Get('beneficio')
  beneficio(
    @CurrentUser() user: AuthContext,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.service.beneficio(user, desde, hasta);
  }

  @Get('beneficio/opciones')
  opciones(@CurrentUser() user: AuthContext) {
    return this.service.opciones(user);
  }

  @Get('tarifas')
  tarifas(@CurrentUser() user: AuthContext) {
    return this.service.tarifas(user);
  }

  @Post('beneficio')
  crear(@CurrentUser() user: AuthContext, @Body() dto: SaveHistoricoBeneficioDto) {
    return this.service.crear(user, dto);
  }

  @Post('beneficio/sincronizar')
  sincronizar(@CurrentUser() user: AuthContext) {
    return this.service.sincronizar(user);
  }

  @Patch('beneficio/:id')
  actualizar(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveHistoricoBeneficioDto,
  ) {
    return this.service.actualizar(user, id, dto);
  }

  @Delete('beneficio/:id')
  borrar(@CurrentUser() user: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.borrar(user, id);
  }

  // ---------------------------- Retomas ----------------------------

  @Get('retomas')
  retomas(
    @CurrentUser() user: AuthContext,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.retomasService.listar(user, desde, hasta);
  }

  @Get('retomas/firmadores')
  firmadoresRetomas(@CurrentUser() user: AuthContext) {
    return this.retomasService.firmadores(user);
  }

  @Get('tarifas-subproductos')
  tarifasSubproductos(@CurrentUser() user: AuthContext) {
    return this.retomasService.tarifas(user);
  }

  @Post('retomas')
  crearRetoma(@CurrentUser() user: AuthContext, @Body() dto: SaveHistoricoRetomaDto) {
    return this.retomasService.crear(user, dto);
  }

  @Patch('retomas/:id')
  actualizarRetoma(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveHistoricoRetomaDto,
  ) {
    return this.retomasService.actualizar(user, id, dto);
  }

  @Delete('retomas/:id')
  borrarRetoma(@CurrentUser() user: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.retomasService.borrar(user, id);
  }

  // ---------------------------- Tarifas ----------------------------

  @Post('tarifas')
  crearTarifa(@CurrentUser() user: AuthContext, @Body() dto: SaveTarifaSacrificioDto) {
    return this.tarifasService.crearSacrificio(user, dto);
  }

  @Patch('tarifas/:id')
  actualizarTarifa(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveTarifaSacrificioDto,
  ) {
    return this.tarifasService.actualizarSacrificio(user, id, dto);
  }

  @Delete('tarifas/:id')
  borrarTarifa(@CurrentUser() user: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.tarifasService.borrarSacrificio(user, id);
  }

  @Post('tarifas-subproductos')
  crearTarifaSubproducto(@CurrentUser() user: AuthContext, @Body() dto: SaveTarifaSubproductoDto) {
    return this.tarifasService.crearSubproducto(user, dto);
  }

  @Patch('tarifas-subproductos/:id')
  actualizarTarifaSubproducto(
    @CurrentUser() user: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveTarifaSubproductoDto,
  ) {
    return this.tarifasService.actualizarSubproducto(user, id, dto);
  }

  @Delete('tarifas-subproductos/:id')
  borrarTarifaSubproducto(@CurrentUser() user: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.tarifasService.borrarSubproducto(user, id);
  }
}
