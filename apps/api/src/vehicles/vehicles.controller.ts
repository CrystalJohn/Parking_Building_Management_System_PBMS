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
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles } from '../auth/decorators';
import { VehiclesService } from './vehicles.service';
import { LinkVehicleUserDto, LookupPlateDto } from './dto';

@Controller('vehicles')
@UseGuards(JwtAuthGuard)
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

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

  @Post(':vehicleId/users')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RolesGuard)
  @Roles(Role.manager, Role.admin)
  linkUser(
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Body() dto: LinkVehicleUserDto,
  ) {
    return this.vehiclesService.linkUser(vehicleId, dto);
  }
}
