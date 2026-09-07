import { Module } from '@nestjs/common';
import { ConductorController } from './conductor.controller';
import { ConductorService } from './conductor.service';

@Module({
  controllers: [ConductorController],
  providers: [ConductorService],
})
export class ConductorModule {}
