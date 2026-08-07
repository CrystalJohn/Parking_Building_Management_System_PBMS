import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ConfigMgmtModule } from '../config-mgmt/config-mgmt.module';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SlotsModule } from '../slots/slots.module';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';

@Module({
  imports: [
    AuthModule,
    PrismaModule,
    NotificationsModule,
    SlotsModule, // provides AllocationService
    ConfigMgmtModule, // provides PricingResolver
  ],
  controllers: [ReservationsController],
  providers: [ReservationsService],
  exports: [ReservationsService],
})
export class ReservationsModule {}
