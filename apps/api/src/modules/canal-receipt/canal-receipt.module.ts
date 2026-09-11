import { Module } from '@nestjs/common';
import { CanalReceiptController } from './canal-receipt.controller';
import { CanalReceiptService } from './canal-receipt.service';

@Module({
  controllers: [CanalReceiptController],
  providers: [CanalReceiptService],
})
export class CanalReceiptModule {}
