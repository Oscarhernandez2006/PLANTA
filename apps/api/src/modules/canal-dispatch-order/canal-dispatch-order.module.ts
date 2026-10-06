import { Module } from '@nestjs/common';
import { CanalDispatchOrderController } from './canal-dispatch-order.controller';
import { CanalDispatchOrderService } from './canal-dispatch-order.service';
import { DespachoPostaService } from './despacho-posta.service';

@Module({
  controllers: [CanalDispatchOrderController],
  providers: [CanalDispatchOrderService, DespachoPostaService],
})
export class CanalDispatchOrderModule {}
