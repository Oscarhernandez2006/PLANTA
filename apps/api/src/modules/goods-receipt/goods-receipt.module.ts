import { Module } from '@nestjs/common';
import { GoodsReceiptController } from './goods-receipt.controller';
import { GoodsReceiptService } from './goods-receipt.service';

@Module({
  controllers: [GoodsReceiptController],
  providers: [GoodsReceiptService],
})
export class GoodsReceiptModule {}
