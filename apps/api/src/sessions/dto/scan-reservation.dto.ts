import { IsNotEmpty, IsString } from 'class-validator';

export class ScanReservationDto {
  @IsString()
  @IsNotEmpty()
  token: string;
}
