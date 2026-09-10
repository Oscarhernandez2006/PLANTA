import { Module } from '@nestjs/common';
import { SubproductosController } from './subproductos.controller';
import { SubproductosService } from './subproductos.service';

@Module({
  controllers: [SubproductosController],
  providers: [SubproductosService],
})
export class SubproductosModule {}
