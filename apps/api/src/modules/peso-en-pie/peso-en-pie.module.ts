import { Module } from '@nestjs/common';
import { PesoEnPieController } from './peso-en-pie.controller';
import { PesoEnPieService } from './peso-en-pie.service';

@Module({
  controllers: [PesoEnPieController],
  providers: [PesoEnPieService],
})
export class PesoEnPieModule {}
