import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser, Roles } from '../auth/decorators';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { AssignStaffGateLaneDto, CreateGateLaneDto, UpdateGateLaneDto } from './dto';
import { GateLanesService } from './gate-lanes.service';

@Controller('gate-lanes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GateLanesController {
  constructor(private readonly gateLanesService: GateLanesService) {}

  @Get('current')
  @Roles(Role.staff)
  getCurrent(@CurrentUser('id') staffId: string) {
    return this.gateLanesService.getCurrentAssignment(staffId);
  }

  @Get('staff')
  @Roles(Role.manager, Role.admin)
  listStaff() {
    return this.gateLanesService.listStaff();
  }

  @Get('coverage/current')
  @Roles(Role.manager, Role.admin)
  getCurrentCoverage() {
    return this.gateLanesService.getCurrentCoverage();
  }

  @Get()
  @Roles(Role.manager, Role.admin)
  listLanes() {
    return this.gateLanesService.listLanes();
  }

  @Get('floors')
  @Roles(Role.manager, Role.admin)
  listFloors() {
    return this.gateLanesService.getFloors();
  }

  @Post()
  @Roles(Role.manager, Role.admin)
  create(@Body() dto: CreateGateLaneDto) {
    return this.gateLanesService.createLane(dto);
  }

  @Patch(':id')
  @Roles(Role.manager, Role.admin)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateGateLaneDto) {
    return this.gateLanesService.updateLane(id, dto);
  }

  @Delete(':id')
  @Roles(Role.manager, Role.admin)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.gateLanesService.deleteLane(id);
  }

  @Post(':laneId/assignments')
  @Roles(Role.manager, Role.admin)
  assign(
    @Param('laneId', ParseUUIDPipe) laneId: string,
    @Body() dto: AssignStaffGateLaneDto,
    @CurrentUser('id') assignedById: string,
  ) {
    return this.gateLanesService.assignStaff(laneId, dto, assignedById);
  }

  @Delete('assignments/:staffId')
  @Roles(Role.manager, Role.admin)
  unassign(@Param('staffId', ParseUUIDPipe) staffId: string) {
    return this.gateLanesService.unassignStaff(staffId);
  }
}
