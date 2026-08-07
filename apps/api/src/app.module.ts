import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { SlotsModule } from './slots/slots.module';
import { SessionsModule } from './sessions/sessions.module';
import { FeesModule } from './fees/fees.module';
import { ReservationsModule } from './reservations/reservations.module';
import { ReportsModule } from './reports/reports.module';
import { ConfigMgmtModule } from './config-mgmt/config-mgmt.module';
import { SimulationModule } from './simulation/simulation.module';
import { PlateRecognitionModule } from './plate-recognition/plate-recognition.module';
import { OcrModule } from './ocr';
import { OcrEvidencesModule } from './ocr-evidences/ocr-evidences.module';
import { PaymentsModule } from './payments/payments.module';
import { AdminModule } from './admin/admin.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { NotificationsModule } from './notifications/notifications.module';
import { GateModule } from './gate/gate.module';
import { OperationIssuesModule } from './operation-issues/operation-issues.module';
import { VehicleRegistrationsModule } from './vehicle-registrations/vehicle-registrations.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { GateLanesModule } from './gate-lanes/gate-lanes.module';
import { GatesModule } from './gates/gates.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    UsersModule,
    SlotsModule,
    SessionsModule,
    FeesModule,
    ReservationsModule,
    ReportsModule,
    ConfigMgmtModule,
    SimulationModule,
    PlateRecognitionModule,
    OcrModule,
    OcrEvidencesModule,
    PaymentsModule,
    AdminModule,
    VehiclesModule,
    NotificationsModule,
    GateModule,
    OperationIssuesModule,
    VehicleRegistrationsModule,
    SubscriptionsModule,
    GateLanesModule,
    GatesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
