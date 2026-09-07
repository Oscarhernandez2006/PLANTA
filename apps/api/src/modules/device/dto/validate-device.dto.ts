import { ArrayMaxSize, ArrayMinSize, IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

export class ValidateDeviceDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  macs!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  hostname?: string;
}
