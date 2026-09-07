import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class CheckCedulaDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{5,15}$/, { message: 'La cédula debe ser numérica.' })
  documentId!: string;
}
