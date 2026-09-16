import { Module } from '@nestjs/common';
import { PostaReceiptController } from './posta-receipt.controller';
import { PostaReceiptService } from './posta-receipt.service';

@Module({
  controllers: [PostaReceiptController],
  providers: [PostaReceiptService],
})
export class PostaReceiptModule {}
