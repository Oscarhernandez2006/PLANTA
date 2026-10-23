import { Module } from '@nestjs/common';
import { HistoricoSacrificioController } from './historico-sacrificio.controller';
import { HistoricoSacrificioService } from './historico-sacrificio.service';
import { HistoricoBeneficioSync } from './historico-beneficio.sync';
import { HistoricoRetomasService } from './historico-retomas.service';
import { HistoricoTarifasService } from './historico-tarifas.service';

@Module({
  controllers: [HistoricoSacrificioController],
  providers: [
    HistoricoSacrificioService,
    HistoricoRetomasService,
    HistoricoTarifasService,
    HistoricoBeneficioSync,
  ],
  exports: [HistoricoBeneficioSync],
})
export class HistoricoSacrificioModule {}
