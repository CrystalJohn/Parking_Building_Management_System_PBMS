import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { VehicleIdentificationService } from './vehicle-identification.service';
import { ManualPlateIdentifier } from './strategies/manual-plate.identifier';
import { ReservationQrIdentifier } from './strategies/reservation-qr.identifier';
import { SessionQrIdentifier } from './strategies/session-qr.identifier';
import { ManualSessionCodeIdentifier } from './strategies/manual-session-code.identifier';

@Module({
  imports: [PrismaModule],
  providers: [
    VehicleIdentificationService,
    ManualPlateIdentifier,
    ReservationQrIdentifier,
    SessionQrIdentifier,
    ManualSessionCodeIdentifier,
  ],
  exports: [VehicleIdentificationService],
})
export class VehicleIdentificationModule {}
