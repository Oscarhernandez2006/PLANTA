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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateClienteDto, UpdateClienteDto } from './dto/create-cliente.dto';
import { QueryClienteDto } from './dto/query-cliente.dto';
import { CreateTiendaDto, UpdateTiendaDto } from './dto/tienda.dto';
import { CreateBodegaDto, UpdateBodegaDto } from './dto/bodega.dto';
import { CreatePuntoEnvioDto, UpdatePuntoEnvioDto } from './dto/punto-envio.dto';
import { ClienteService } from './cliente.service';
import { BodegaService } from './bodega.service';
import { TiendaService } from './tienda.service';
import { PuntoEnvioService } from './punto-envio.service';

@UseGuards(JwtAuthGuard)
@Controller('clientes')
export class ClienteController {
  constructor(
    private readonly service: ClienteService,
    private readonly tiendas: TiendaService,
    private readonly bodegas: BodegaService,
    private readonly puntos: PuntoEnvioService,
  ) {}

  @Get(':id/puntos-envio')
  listPuntosEnvio(@Param('id', ParseUUIDPipe) id: string) {
    return this.puntos.list(id);
  }

  @Post(':id/puntos-envio')
  createPuntoEnvio(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreatePuntoEnvioDto) {
    return this.puntos.create(id, dto);
  }

  @Patch('puntos-envio/:puntoId')
  updatePuntoEnvio(
    @Param('puntoId', ParseUUIDPipe) puntoId: string,
    @Body() dto: UpdatePuntoEnvioDto,
  ) {
    return this.puntos.update(puntoId, dto);
  }

  @Get('bodegas/next-code')
  nextBodegaCode() {
    return this.bodegas.nextCode();
  }

  @Get(':id/bodegas')
  listBodegas(@Param('id', ParseUUIDPipe) id: string) {
    return this.bodegas.list(id);
  }

  @Post(':id/bodegas')
  createBodega(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateBodegaDto) {
    return this.bodegas.create(id, dto);
  }

  @Patch('bodegas/:bodegaId')
  updateBodega(
    @Param('bodegaId', ParseUUIDPipe) bodegaId: string,
    @Body() dto: UpdateBodegaDto,
  ) {
    return this.bodegas.update(bodegaId, dto);
  }

  @Get('next-code')
  nextCode() {
    return this.service.nextCode();
  }

  @Get('resumen')
  resumen() {
    return this.service.resumen();
  }

  @Get(':id/ordenes')
  ordenes(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.ordenes(id);
  }

  @Get()
  findAll(@Query() query: QueryClienteDto) {
    return this.service.findAll(query.search, query.todos);
  }

  @Post()
  create(@Body() dto: CreateClienteDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateClienteDto) {
    return this.service.update(id, dto);
  }

  @Get(':id/tiendas')
  listTiendas(@Param('id', ParseUUIDPipe) id: string) {
    return this.tiendas.list(id);
  }

  @Get(':id/tiendas/next-code')
  nextTiendaCode(@Param('id', ParseUUIDPipe) id: string) {
    return this.tiendas.nextCode(id);
  }

  @Post(':id/tiendas')
  createTienda(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateTiendaDto) {
    return this.tiendas.create(id, dto);
  }

  @Patch('tiendas/:tiendaId')
  updateTienda(
    @Param('tiendaId', ParseUUIDPipe) tiendaId: string,
    @Body() dto: UpdateTiendaDto,
  ) {
    return this.tiendas.update(tiendaId, dto);
  }
}
