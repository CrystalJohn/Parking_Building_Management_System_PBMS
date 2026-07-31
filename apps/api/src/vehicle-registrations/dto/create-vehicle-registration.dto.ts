import { IsEnum, IsNotEmpty, IsString, Matches } from 'class-validator';
import { VehicleType } from '@prisma/client';

const VIETNAMESE_PLATE_REGEX = /^(?:\d{2}[A-Z]\d{5}|\d{2}[A-Z]\d\d{5})$/;

export class CreateVehicleRegistrationDto {
  @IsString()
  @IsNotEmpty()
  @Matches(VIETNAMESE_PLATE_REGEX, {
    message: 'License plate must be 7-9 alphanumeric characters: province code (2 digits) + series (1-2 letters/digits) + 5 digits. Example: 30A12345',
  })
  plateNumber: string;

  @IsEnum(VehicleType)
  vehicleType: VehicleType;
}
