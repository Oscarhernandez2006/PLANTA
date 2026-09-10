import { Module } from '@nestjs/common';
import { PielesController } from './pieles.controller';
import { PielesService } from './pieles.service';

@Module({
  controllers: [PielesController],
  providers: [PielesService],
})
export class PielesModule {}
