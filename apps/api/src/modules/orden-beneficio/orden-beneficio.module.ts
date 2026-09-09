import { Module } from '@nestjs/common';
import { OrdenBeneficioController } from './orden-beneficio.controller';
import { OrdenBeneficioService } from './orden-beneficio.service';

@Module({
  controllers: [OrdenBeneficioController],
  providers: [OrdenBeneficioService],
  exports: [OrdenBeneficioService],
})
export class OrdenBeneficioModule {}
