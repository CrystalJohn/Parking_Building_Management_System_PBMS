import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { VehicleType } from '@prisma/client';
import { normalize } from '../../plates/plate-formatter';
import { Transform } from 'class-transformer';

export class CreateVehicleRegistrationDto {
  @Transform(({ value }) => normalize(String(value ?? '')))
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập biển số xe.' })
  plateNumber: string;

  @IsEnum(VehicleType)
  vehicleType: VehicleType;
}
