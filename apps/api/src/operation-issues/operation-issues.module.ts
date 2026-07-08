import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OperationIssuesController } from './operation-issues.controller';
import { OperationIssuesService } from './operation-issues.service';

@Module({
  imports: [PrismaModule],
  controllers: [OperationIssuesController],
  providers: [OperationIssuesService],
  exports: [OperationIssuesService],
})
export class OperationIssuesModule {}
