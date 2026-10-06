import { Module } from '@nestjs/common';
import { ConditioningOrderController } from './conditioning-order.controller';
import { ConditioningOrderService } from './conditioning-order.service';

@Module({
  controllers: [ConditioningOrderController],
  providers: [ConditioningOrderService],
})
export class ConditioningOrderModule {}
