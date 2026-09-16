import { DispatchOrderStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';

export class CreatePostaReceiptDto {
  @IsUUID()
  clientId!: string;

  @IsDateString()
  registrationDate!: string;

  @IsDateString()
  processDate!: string;

  @IsOptional()
  @IsEnum(DispatchOrderStatus)
  status?: DispatchOrderStatus;
}
