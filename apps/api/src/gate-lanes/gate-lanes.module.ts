import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { GateLanesController } from './gate-lanes.controller';
import { GateLanesService } from './gate-lanes.service';

@Module({
  imports: [PrismaModule],
  controllers: [GateLanesController],
  providers: [GateLanesService],
  exports: [GateLanesService],
})
export class GateLanesModule {}
