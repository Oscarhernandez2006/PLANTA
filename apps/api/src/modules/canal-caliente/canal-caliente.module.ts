import { Module } from '@nestjs/common';
import { CanalCalienteController } from './canal-caliente.controller';
import { CanalCalienteService } from './canal-caliente.service';

@Module({
  controllers: [CanalCalienteController],
  providers: [CanalCalienteService],
})
export class CanalCalienteModule {}
