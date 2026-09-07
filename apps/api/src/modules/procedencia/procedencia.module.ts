import { Module } from '@nestjs/common';
import { ProcedenciaController } from './procedencia.controller';
import { ProcedenciaService } from './procedencia.service';

@Module({
  controllers: [ProcedenciaController],
  providers: [ProcedenciaService],
})
export class ProcedenciaModule {}
