import { Module } from '@nestjs/common';
import { VehicleRegistrationsService } from './vehicle-registrations.service';
import { VehicleRegistrationsController } from './vehicle-registrations.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, NotificationsModule],
  providers: [VehicleRegistrationsService],
  controllers: [VehicleRegistrationsController]
})
export class VehicleRegistrationsModule {}
