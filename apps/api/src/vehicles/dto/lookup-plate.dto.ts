import { IsNotEmpty, IsString } from 'class-validator';

export class LookupPlateDto {
  @IsString()
  @IsNotEmpty()
  plateNumber: string;
}
