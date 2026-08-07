import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles } from '../auth/decorators';
import { FeesService } from './fees.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class FeesController {
  constructor(
    private readonly feesService: FeesService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * GET /pricing
   * 23.1: All authenticated users — get pricing config.
   */
  @Get('pricing')
  async getPricing() {
    const configs = await this.prisma.pricingConfig.findMany({
      select: {
        id: true,
        vehicleType: true,
        overtimePenalty: true,
        lostTicketPenalty: true,
        overtimeThresholdHours: true,
      },
      orderBy: { vehicleType: 'asc' },
    });

    // Attach hourlyRate from RateTable DEFAULT for each vehicle type
    const result = await Promise.all(
      configs.map(async (config) => {
        const rateTable = await this.prisma.rateTable.findFirst({
          where: {
            vehicleType: config.vehicleType,
            type: 'DEFAULT',
            isActive: true,
          },
          select: { hourlyRate: true },
        });
        return {
          ...config,
          hourlyRate: rateTable?.hourlyRate ?? 0,
        };
      }),
    );

    return result;
  }

  /**
   * GET /fees/calculate/:session_id
   * 14.6: Staff preview — calculate fee without persisting.
   * Query param ?lost=true to include lost ticket penalty.
   */
  @Get('fees/calculate/:session_id')
  @UseGuards(RolesGuard)
  @Roles(Role.staff)
  calculate(
    @Param('session_id', ParseUUIDPipe) sessionId: string,
    @Query('lost') lost?: string,
  ) {
    const isLost = lost === 'true';
    return this.feesService.preview(sessionId, isLost);
  }
}
