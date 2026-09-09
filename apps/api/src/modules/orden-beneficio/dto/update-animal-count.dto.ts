import { IsInt, Min } from 'class-validator';

export class UpdateAnimalCountDto {
  @IsInt()
  @Min(1)
  animalCount!: number;
}
