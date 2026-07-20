import { IsEnum, IsNotEmpty, IsString, Matches } from 'class-validator';
import { VehicleType } from '@prisma/client';

export class CreateVehicleRegistrationDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z0-9]+$/, {
    message: 'Biển số xe chỉ được chứa chữ cái in hoa và số, không khoảng trắng hay ký tự đặc biệt',
  })
  plateNumber: string;

  @IsEnum(VehicleType)
  vehicleType: VehicleType;
}
