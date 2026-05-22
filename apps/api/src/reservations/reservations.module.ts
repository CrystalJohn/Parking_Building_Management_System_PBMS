import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SlotsModule } from '../slots/slots.module';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';

@Module({
  imports: [
    PrismaModule,
    SlotsModule, // provides AllocationService
  ],
  controllers: [ReservationsController],
  providers: [ReservationsService],
  exports: [ReservationsService],
})
export class ReservationsModule {}
