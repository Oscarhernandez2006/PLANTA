import { Module } from '@nestjs/common';
import { FinanzasService } from './finanzas.service';
import { HistorialService } from './historial.service';
import { MaestrosController } from './maestros.controller';
import { MaestrosService } from './maestros.service';
import { TalleresController } from './talleres.controller';
import { TalleresService } from './talleres.service';

@Module({
  controllers: [TalleresController, MaestrosController],
  providers: [TalleresService, MaestrosService, FinanzasService, HistorialService],
})
export class TalleresModule {}
