import { Module } from '@nestjs/common';
import { PesoCamionController } from './peso-camion.controller';
import { PesoCamionService } from './peso-camion.service';

@Module({
  controllers: [PesoCamionController],
  providers: [PesoCamionService],
})
export class PesoCamionModule {}
