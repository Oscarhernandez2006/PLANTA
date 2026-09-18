import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AsignarCavaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  cava!: string;
}
