import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { GatesController } from './gates.controller';
import { GatesService } from './gates.service';

@Module({
  imports: [PrismaModule],
  controllers: [GatesController],
  providers: [GatesService],
  exports: [GatesService],
})
export class GatesModule {}
