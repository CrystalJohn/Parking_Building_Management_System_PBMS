import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles } from '../auth/decorators';
import { ResearchService } from './research.service';

/**
 * 33: Research metrics endpoints.
 * Aggregate data for answering RQ1–RQ4.
 * Accessible by Manager and Admin.
 */
@Controller('reports/research')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.manager, Role.admin)
export class ResearchController {
  constructor(private readonly researchService: ResearchService) {}

  /**
   * GET /reports/research/utilization?strategy=balanced_occupancy
   * RQ1: Slot utilization per zone/floor.
   * Optional filter by strategy.
   */
  @Get('utilization')
  getUtilization(@Query('strategy') strategy?: string) {
    return this.researchService.getUtilization(strategy || undefined);
  }

  /**
   * GET /reports/research/allocation-time
   * RQ2: Average allocation_time_ms per strategy.
   */
  @Get('allocation-time')
  getAllocationTime() {
    return this.researchService.getAllocationTime();
  }

  /**
   * GET /reports/research/distribution-variance
   * RQ3: Variance of session distribution across floors per strategy.
   */
  @Get('distribution-variance')
  getDistributionVariance() {
    return this.researchService.getDistributionVariance();
  }

  /**
   * GET /reports/research/peak-rejection
   * RQ4: Peak occupancy + rejection rate per strategy.
   */
  @Get('peak-rejection')
  getPeakRejection() {
    return this.researchService.getPeakRejection();
  }
}
