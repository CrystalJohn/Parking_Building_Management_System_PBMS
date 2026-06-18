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
import { PaymentsModule } from './payments/payments.module';

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
    PaymentsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
