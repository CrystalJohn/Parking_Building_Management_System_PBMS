import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser, Roles } from '../auth/decorators';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { VehicleRegistrationsService } from './vehicle-registrations.service';
import { CreateVehicleRegistrationDto, ReviewVehicleRegistrationDto } from './dto';

@Controller('vehicle-registrations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VehicleRegistrationsController {
  constructor(private readonly vehicleRegistrationsService: VehicleRegistrationsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(Role.driver)
  createRequest(
    @CurrentUser('id') driverId: string,
    @Body() dto: CreateVehicleRegistrationDto,
  ) {
    return this.vehicleRegistrationsService.createRequest(driverId, dto);
  }

  @Get('my')
  @Roles(Role.driver)
  findMyRequests(@CurrentUser('id') driverId: string) {
    return this.vehicleRegistrationsService.findMyRequests(driverId);
  }

  @Get('pending')
  @Roles(Role.manager, Role.admin)
  findPendingRequests() {
    return this.vehicleRegistrationsService.findPendingRequests();
  }

  @Patch(':id/review')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.manager, Role.admin)
  reviewRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') managerId: string,
    @Body() dto: ReviewVehicleRegistrationDto,
  ) {
    return this.vehicleRegistrationsService.reviewRequest(id, dto, managerId);
  }
}
