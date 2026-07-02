import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { VehicleUserRole } from '@prisma/client';

export class LinkVehicleUserDto {
  @IsUUID()
  userId: string;

  @IsOptional()
  @IsEnum(VehicleUserRole, {
    message: 'Role must be one of: owner, driver',
  })
  role: VehicleUserRole = VehicleUserRole.driver;
}
