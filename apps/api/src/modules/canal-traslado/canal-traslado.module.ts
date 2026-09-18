import { Module } from '@nestjs/common';
import { CanalTrasladoController } from './canal-traslado.controller';
import { CanalTrasladoService } from './canal-traslado.service';

@Module({
  controllers: [CanalTrasladoController],
  providers: [CanalTrasladoService],
})
export class CanalTrasladoModule {}
