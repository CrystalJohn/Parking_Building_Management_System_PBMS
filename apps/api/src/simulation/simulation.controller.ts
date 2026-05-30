import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles, CurrentUser } from '../auth/decorators';
import { SimulationService } from './simulation.service';
import { RunSimulationDto } from './dto';

@Controller('admin/simulation')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.admin, Role.manager)
export class SimulationController {
  constructor(private readonly simulationService: SimulationService) {}

  /**
   * POST /admin/simulation/run
   * 34.1: Run a simulation with given parameters.
   */
  @Post('run')
  run(
    @Body() dto: RunSimulationDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.simulationService.run(dto, userId);
  }

  /**
   * GET /admin/simulation/runs
   * List past simulation runs.
   */
  @Get('runs')
  listRuns(@Query('limit') limit?: string) {
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    return this.simulationService.listRuns(
      isNaN(parsedLimit) ? 20 : Math.min(parsedLimit, 100),
    );
  }
}
