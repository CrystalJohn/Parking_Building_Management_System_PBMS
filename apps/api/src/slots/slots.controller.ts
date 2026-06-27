import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles } from '../auth/decorators';
import { SlotsService } from './slots.service';
import { SlotAvailabilityQueryDto, UpdateSlotStatusDto } from './dto';

@Controller('slots')
export class SlotsController {
  constructor(private readonly slotsService: SlotsService) {}

  /**
   * GET /slots/summary — PUBLIC (no auth)
   * Returns building-wide occupancy for landing page.
   */
  @Get('summary')
  getPublicSummary() {
    return this.slotsService.getPublicSummary();
  }

  /**
   * GET /slots — all authenticated roles
   * 11.1
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  findAll() {
    return this.slotsService.findAll();
  }

  /**
   * GET /slots/availability — all authenticated roles
   * 11.2 / Req 4.4
   * NOTE: must be declared before :id routes to avoid Express matching
   * "availability" as an id param.
   */
  @Get('availability')
  @UseGuards(JwtAuthGuard)
  getAvailability(@Query() query: SlotAvailabilityQueryDto) {
    if (query.vehicleType || query.plannedArrivalAt) {
      if (!query.vehicleType || !query.plannedArrivalAt) {
        throw new BadRequestException(
          'vehicleType and plannedArrivalAt are required together',
        );
      }

      return this.slotsService.getPlannedAvailability(
        query.vehicleType,
        query.plannedArrivalAt,
      );
    }

    return this.slotsService.getAvailability();
  }

  /**
   * PATCH /slots/:id/status — manager only
   * 11.3 / Req 10.3
   */
  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.manager)
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSlotStatusDto,
  ) {
    return this.slotsService.updateStatus(id, dto);
  }
}
