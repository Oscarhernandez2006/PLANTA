import { Module } from '@nestjs/common';
import { ConservacionController } from './conservacion.controller';
import { ConservacionService } from './conservacion.service';

@Module({
  controllers: [ConservacionController],
  providers: [ConservacionService],
})
export class ConservacionModule {}
