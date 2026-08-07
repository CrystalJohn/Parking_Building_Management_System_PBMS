import {
  Controller,
  Get,
  Put,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  BadRequestException,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles, CurrentUser } from '../auth/decorators';
import { ConfigMgmtService } from './config-mgmt.service';
import { AllocationService } from '../slots/allocation.service';
import {
  UpdatePricingDto,
  UpdateBuildingDto,
  CreateRateTableDto,
  UpdateRateTableDto,
  ListRateTablesDto,
} from './dto';

@Controller('config')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.manager, Role.admin)
export class ConfigMgmtController {
  constructor(
    private readonly configService: ConfigMgmtService,
    private readonly allocationService: AllocationService,
  ) {}

  /**
   * GET /config/pricing
   * 29.1: Get all pricing configs.
   * Req 10.2
   */
  @Get('pricing')
  getPricing() {
    return this.configService.getPricing();
  }

  /**
   * PUT /config/pricing
   * 29.1: Update pricing for a vehicle type.
   * Req 10.4
   */
  @Put('pricing')
  updatePricing(
    @Body() dto: UpdatePricingDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.configService.updatePricing(dto, userId);
  }

  // ─── RateTable endpoints (BR-01 to BR-04) ──────────────────────────────

  /**
   * GET /config/pricing/events — list rate tables.
   */
  @Get('pricing/events')
  getRateTables(@Query() query: ListRateTablesDto) {
    return this.configService.getRateTables(query);
  }

  /**
   * POST /config/pricing/events — create EVENT rate table.
   */
  @Post('pricing/events')
  createRateTable(
    @Body() dto: CreateRateTableDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.configService.createRateTable(dto, userId);
  }

  /**
   * PATCH /config/pricing/events/:id — update EVENT rate table.
   */
  @Patch('pricing/events/:id')
  updateRateTable(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRateTableDto,
  ) {
    return this.configService.updateRateTable(id, dto);
  }

  /**
   * DELETE /config/pricing/events/:id — soft delete EVENT rate table.
   */
  @Delete('pricing/events/:id')
  deleteRateTable(@Param('id', ParseUUIDPipe) id: string) {
    return this.configService.deleteRateTable(id);
  }

  /**
   * GET /config/building
   * 29.2: Get building structure info.
   * Req 10.1
   */
  @Get('building')
  getBuilding() {
    return this.configService.getBuilding();
  }

  /**
   * PUT /config/building
   * 29.2: Update building structure.
   * 29.3: Validates slot count >= occupied count.
   * Req 10.1
   */
  @Put('building')
  updateBuilding(@Body() dto: UpdateBuildingDto) {
    return this.configService.updateBuilding(dto);
  }

  /**
   * GET /config/strategy
   * 31.3: Get active allocation strategy + list available strategies.
   */
  @Get('strategy')
  async getStrategy() {
    const active = await this.allocationService.getActiveStrategyName();
    const available = this.allocationService.getAvailableStrategies();
    return { active, available };
  }

  /**
   * PUT /config/strategy
   * 31.3: Set active allocation strategy.
   */
  @Put('strategy')
  async updateStrategy(@Body() body: { strategy: string }) {
    const available = this.allocationService.getAvailableStrategies();
    const valid = available.find((s) => s.name === body.strategy);

    if (!valid) {
      throw new BadRequestException(
        `Invalid strategy: ${body.strategy}. Available: ${available.map((s) => s.name).join(', ')}`,
      );
    }

    return this.configService.updateStrategy(body.strategy);
  }
}
