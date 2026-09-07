import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{5,15}$/, { message: 'La cédula debe ser numérica.' })
  documentId!: string;

  @IsString()
  @Length(4, 12)
  @Matches(/^\d+$/, { message: 'El PIN debe ser numérico.' })
  pin!: string;
}
