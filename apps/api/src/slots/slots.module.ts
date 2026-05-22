import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SlotsController } from './slots.controller';
import { SlotsService } from './slots.service';
import { AllocationService } from './allocation.service';

@Module({
  imports: [PrismaModule],
  controllers: [SlotsController],
  providers: [SlotsService, AllocationService],
  exports: [SlotsService, AllocationService],
})
export class SlotsModule {}
