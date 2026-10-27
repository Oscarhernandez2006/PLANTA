import { DispatchOrderStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

export class QueryDispatchOrderDto {
  @IsOptional()
  @IsEnum(DispatchOrderStatus)
  status?: DispatchOrderStatus;

  /** Órdenes sobre las que se puede crear una OP: activas o cerradas sin OP. */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  paraProduccion?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}
