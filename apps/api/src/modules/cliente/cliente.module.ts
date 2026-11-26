import { Module } from '@nestjs/common';
import { ClienteController } from './cliente.controller';
import { ClienteService } from './cliente.service';
import { BodegaService } from './bodega.service';
import { TiendaService } from './tienda.service';
import { PuntoEnvioService } from './punto-envio.service';

@Module({
  controllers: [ClienteController],
  providers: [ClienteService, TiendaService, BodegaService, PuntoEnvioService],
})
export class ClienteModule {}
