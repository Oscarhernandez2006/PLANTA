import { Module } from '@nestjs/common';
import { DispatchOrderController } from './dispatch-order.controller';
import { DispatchOrderService } from './dispatch-order.service';

@Module({
  controllers: [DispatchOrderController],
  providers: [DispatchOrderService],
})
export class DispatchOrderModule {}
