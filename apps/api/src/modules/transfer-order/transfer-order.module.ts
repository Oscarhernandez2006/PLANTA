import { Module } from '@nestjs/common';
import { TransferOrderController } from './transfer-order.controller';
import { TransferOrderService } from './transfer-order.service';

@Module({
  controllers: [TransferOrderController],
  providers: [TransferOrderService],
  exports: [TransferOrderService],
})
export class TransferOrderModule {}
