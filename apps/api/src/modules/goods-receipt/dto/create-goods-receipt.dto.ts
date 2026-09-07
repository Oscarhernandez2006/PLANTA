import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CreateGoodsReceiptItemDto } from './create-goods-receipt-item.dto';

export class CreateGoodsReceiptDto {
  @IsUUID()
  supplierId!: string;

  @IsDateString()
  receivedDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  originIcaCode?: string;

  @IsOptional()
  @IsObject()
  extra?: Record<string, unknown>;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => CreateGoodsReceiptItemDto)
  items!: CreateGoodsReceiptItemDto[];
}
