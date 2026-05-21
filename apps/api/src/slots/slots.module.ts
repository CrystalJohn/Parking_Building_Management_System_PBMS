import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SlotsController } from './slots.controller';
import { SlotsService } from './slots.service';

@Module({
  imports: [PrismaModule],
  controllers: [SlotsController],
  providers: [SlotsService],
  exports: [SlotsService], // export for use by Sessions/Allocation modules later
})
export class SlotsModule {}
