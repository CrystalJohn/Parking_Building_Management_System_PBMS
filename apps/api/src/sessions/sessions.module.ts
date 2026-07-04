import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SlotsModule } from '../slots/slots.module';
import { FeesModule } from '../fees/fees.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { VehicleIdentificationModule } from '../vehicle-identification/vehicle-identification.module';
import { OcrModule } from '../ocr';
import { OcrEvidencesModule } from '../ocr-evidences/ocr-evidences.module';
import { CheckinController } from './checkin.controller';
import { SessionsController } from './sessions.controller';
import { TicketsController } from './tickets.controller';
import { SessionsService } from './sessions.service';

@Module({
  imports: [
    AuthModule,
    PrismaModule,
    SlotsModule,
    FeesModule,
    NotificationsModule,
    VehicleIdentificationModule,
    OcrModule,
    OcrEvidencesModule,
  ],
  controllers: [SessionsController, CheckinController, TicketsController],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
