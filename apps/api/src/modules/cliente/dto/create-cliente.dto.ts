import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateClienteDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  concepto!: string;
}
