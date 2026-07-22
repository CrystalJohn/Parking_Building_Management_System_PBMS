import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OcrModule } from '../ocr';
import { SessionsModule } from '../sessions/sessions.module';
import { VehiclesModule } from '../vehicles/vehicles.module';
import { GateLanesModule } from '../gate-lanes/gate-lanes.module';
import { GateController } from './gate.controller';
import { GateService } from './gate.service';

@Module({
  imports: [AuthModule, OcrModule, SessionsModule, VehiclesModule, GateLanesModule],
  controllers: [GateController],
  providers: [GateService],
  exports: [GateService],
})
export class GateModule {}
