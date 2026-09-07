import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateConductorDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  concepto!: string;
}
