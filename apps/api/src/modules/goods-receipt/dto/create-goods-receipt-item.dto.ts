import { QuarterType, UnitForm } from '@prisma/client';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
} from 'class-validator';

export class CreateGoodsReceiptItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  itemCode!: string;

  @IsEnum(UnitForm)
  unitForm!: UnitForm;

  // La obligatoriedad/exclusión según unitForm se valida en el servicio
  // (regla de negocio) y en la base de datos (CHECK constraint).
  @IsOptional()
  @IsEnum(QuarterType)
  quarterType?: QuarterType;

  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  @Max(2000)
  weightKg!: number;
}
