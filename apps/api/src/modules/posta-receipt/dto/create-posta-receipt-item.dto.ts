import { IsNumber, IsUUID, Min } from 'class-validator';

export class CreatePostaReceiptItemDto {
  @IsUUID()
  productId!: string;

  @IsNumber()
  @Min(0)
  taraKg!: number;

  @IsNumber()
  @Min(0)
  brutoKg!: number;
}
