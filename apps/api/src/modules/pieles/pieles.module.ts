import { Module } from '@nestjs/common';
import { PielesController } from './pieles.controller';
import { PielesService } from './pieles.service';

import { HistoricoSacrificioModule } from '../historico-sacrificio/historico-sacrificio.module';

@Module({
  imports: [HistoricoSacrificioModule],
  controllers: [PielesController],
  providers: [PielesService],
})
export class PielesModule {}
