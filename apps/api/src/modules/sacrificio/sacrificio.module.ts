import { Module } from '@nestjs/common';
import { SacrificioController } from './sacrificio.controller';
import { SacrificioService } from './sacrificio.service';

@Module({
  controllers: [SacrificioController],
  providers: [SacrificioService],
})
export class SacrificioModule {}
