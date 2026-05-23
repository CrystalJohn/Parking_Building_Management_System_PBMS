import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SlotsModule } from '../slots/slots.module';
import { ConfigMgmtController } from './config-mgmt.controller';
import { ConfigMgmtService } from './config-mgmt.service';

@Module({
  imports: [PrismaModule, SlotsModule],
  controllers: [ConfigMgmtController],
  providers: [ConfigMgmtService],
  exports: [ConfigMgmtService],
})
export class ConfigMgmtModule {}
