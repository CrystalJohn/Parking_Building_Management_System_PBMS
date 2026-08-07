import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SlotsModule } from '../slots/slots.module';
import { ConfigMgmtController } from './config-mgmt.controller';
import { ConfigMgmtService } from './config-mgmt.service';
import { PricingResolver } from './pricing-resolver.service';

@Module({
  imports: [PrismaModule, SlotsModule],
  controllers: [ConfigMgmtController],
  providers: [ConfigMgmtService, PricingResolver],
  exports: [ConfigMgmtService, PricingResolver],
})
export class ConfigMgmtModule {}
