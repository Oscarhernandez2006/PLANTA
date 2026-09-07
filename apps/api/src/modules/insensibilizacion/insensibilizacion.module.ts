import { Module } from '@nestjs/common';
import { InsensibilizacionController } from './insensibilizacion.controller';
import { InsensibilizacionService } from './insensibilizacion.service';

@Module({
  controllers: [InsensibilizacionController],
  providers: [InsensibilizacionService],
})
export class InsensibilizacionModule {}
