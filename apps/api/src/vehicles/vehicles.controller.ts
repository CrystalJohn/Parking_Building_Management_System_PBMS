import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser, Roles } from '../auth/decorators';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { VehiclesService } from './vehicles.service';
import { LookupPlateDto } from './dto';

@Controller('vehicles')
@UseGuards(JwtAuthGuard)
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Get('my')
  @UseGuards(RolesGuard)
  @Roles(Role.driver)
  findMyVehicles(@CurrentUser('id') driverId: string) {
    return this.vehiclesService.findMyVehicles(driverId);
  }

  @Get('match-plate')
  @UseGuards(RolesGuard)
  @Roles(Role.staff, Role.manager, Role.admin)
  matchPlate(@Query('plateNumber') plateNumber: string) {
    return this.vehiclesService.matchPlate(plateNumber);
  }

  @Post('lookup-plate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(Role.staff, Role.manager, Role.admin)
  lookupPlate(@Body() dto: LookupPlateDto) {
    return this.vehiclesService.lookupPlate(dto.plateNumber);
  }

}
