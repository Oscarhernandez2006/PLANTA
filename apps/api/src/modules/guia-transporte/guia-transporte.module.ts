import { Module } from '@nestjs/common';
import { GuiaTransporteController } from './guia-transporte.controller';
import { GuiaTransporteService } from './guia-transporte.service';

@Module({
  controllers: [GuiaTransporteController],
  providers: [GuiaTransporteService],
  exports: [GuiaTransporteService],
})
export class GuiaTransporteModule {}
