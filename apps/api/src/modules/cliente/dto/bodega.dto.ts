import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const mayus = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class CreateBodegaDto {
  @Transform(mayus)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nombre!: string;
}

export class UpdateBodegaDto {
  @IsOptional()
  @Transform(mayus)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nombre?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
