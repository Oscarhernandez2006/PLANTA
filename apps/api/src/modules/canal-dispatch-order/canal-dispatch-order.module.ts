import { Module } from '@nestjs/common';
import { CanalDispatchOrderController } from './canal-dispatch-order.controller';
import { CanalDispatchOrderService } from './canal-dispatch-order.service';
import { DespachoPostaService } from './despacho-posta.service';
import { RemisionService } from './remision.service';

@Module({
  controllers: [CanalDispatchOrderController],
  providers: [CanalDispatchOrderService, DespachoPostaService, RemisionService],
  exports: [DespachoPostaService],
})
export class CanalDispatchOrderModule {}
