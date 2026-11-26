import { Module } from '@nestjs/common';
import { CanalDispatchOrderModule } from '../canal-dispatch-order/canal-dispatch-order.module';
import { TransferOrderModule } from '../transfer-order/transfer-order.module';
import { ArrumeService } from './arrume.service';
import { PickingController } from './picking.controller';
import { PickingService } from './picking.service';

@Module({
  imports: [CanalDispatchOrderModule, TransferOrderModule],
  controllers: [PickingController],
  providers: [PickingService, ArrumeService],
})
export class PickingModule {}
