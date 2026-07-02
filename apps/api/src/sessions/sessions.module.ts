import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SlotsModule } from '../slots/slots.module';
import { FeesModule } from '../fees/fees.module';
import { VehicleIdentificationModule } from '../vehicle-identification/vehicle-identification.module';
import { CheckinController } from './checkin.controller';
import { SessionsController } from './sessions.controller';
import { TicketsController } from './tickets.controller';
import { SessionsService } from './sessions.service';

@Module({
  imports: [
    AuthModule,
    PrismaModule,
    SlotsModule,    // provides AllocationService
    FeesModule,     // provides FeesService for check-out fee calculation
    VehicleIdentificationModule, // provides VehicleIdentificationService
  ],
  controllers: [SessionsController, CheckinController, TicketsController],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
