import { Module } from '@nestjs/common';
import { OrdenBeneficioModule } from '../orden-beneficio/orden-beneficio.module';
import { PesoCamionController } from './peso-camion.controller';
import { PesoCamionService } from './peso-camion.service';

@Module({
  imports: [OrdenBeneficioModule],
  controllers: [PesoCamionController],
  providers: [PesoCamionService],
})
export class PesoCamionModule {}
