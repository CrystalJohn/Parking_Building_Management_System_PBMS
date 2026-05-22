import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles } from '../auth/decorators';
import { ReportsService, ReportPeriod } from './reports.service';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.manager, Role.admin)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  /**
   * GET /reports/revenue?period=daily|weekly|monthly&date=2024-01-15
   * 26.1: Revenue breakdown by vehicle type.
   * Req 11.1
   */
  @Get('revenue')
  getRevenue(
    @Query('period') period: string = 'daily',
    @Query('date') date: string = new Date().toISOString().split('T')[0],
  ) {
    const validPeriod = this.validatePeriod(period);
    return this.reportsService.getRevenue(validPeriod, date);
  }

  /**
   * GET /reports/traffic?period=daily|weekly|monthly&date=2024-01-15
   * 26.2: Entry/exit count by hour and floor.
   * Req 11.2
   */
  @Get('traffic')
  getTraffic(
    @Query('period') period: string = 'daily',
    @Query('date') date: string = new Date().toISOString().split('T')[0],
  ) {
    const validPeriod = this.validatePeriod(period);
    return this.reportsService.getTraffic(validPeriod, date);
  }

  /**
   * GET /reports/occupancy
   * 26.3: Current occupancy by floor/zone.
   * Req 11.3
   */
  @Get('occupancy')
  getOccupancy() {
    return this.reportsService.getOccupancy();
  }

  private validatePeriod(period: string): ReportPeriod {
    if (['daily', 'weekly', 'monthly'].includes(period)) {
      return period as ReportPeriod;
    }
    return 'daily';
  }
}
