import { Module } from '@nestjs/common';
import { CanalCalienteController } from './canal-caliente.controller';
import { CanalCalienteService } from './canal-caliente.service';

import { HistoricoSacrificioModule } from '../historico-sacrificio/historico-sacrificio.module';

@Module({
  imports: [HistoricoSacrificioModule],
  controllers: [CanalCalienteController],
  providers: [CanalCalienteService],
})
export class CanalCalienteModule {}
