import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ResearchController } from './research.controller';
import { ResearchService } from './research.service';

@Module({
  imports: [PrismaModule],
  controllers: [ReportsController, ResearchController],
  providers: [ReportsService, ResearchService],
  exports: [ReportsService, ResearchService],
})
export class ReportsModule {}
