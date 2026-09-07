import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateDeviceDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[0-9A-Fa-f]{2}([:-][0-9A-Fa-f]{2}){5}$/, {
    message: 'MAC inválida (formato esperado AA:BB:CC:DD:EE:FF).',
  })
  mac!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
