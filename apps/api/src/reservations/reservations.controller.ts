import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles, CurrentUser } from '../auth/decorators';
import { ReservationsService } from './reservations.service';
import { CreateReservationDto } from './dto';

@Controller('reservations')
@UseGuards(JwtAuthGuard)
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  /**
   * POST /reservations
   * 18.1: Driver only — create a reservation.
   * Req 8.1, 8.2
   */
  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.driver)
  create(
    @Body() dto: CreateReservationDto,
    @CurrentUser('id') driverId: string,
  ) {
    return this.reservationsService.create(dto, driverId);
  }

  /**
   * GET /reservations/my
   * 18.3: Driver only — list own reservations.
   */
  @Get('my')
  @UseGuards(RolesGuard)
  @Roles(Role.driver)
  findMy(@CurrentUser('id') driverId: string) {
    return this.reservationsService.findMyReservations(driverId);
  }

  /**
   * GET /reservations/:id
   * P0: Driver only — get a single reservation by ID.
   * Ownership is enforced: driver can only view their own reservation.
   */
  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.driver)
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') driverId: string,
  ) {
    return this.reservationsService.findOne(id, driverId);
  }

  /**
   * DELETE /reservations/:id
   * 18.4: Driver only — cancel a reservation.
   */
  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.driver)
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') driverId: string,
  ) {
    return this.reservationsService.cancel(id, driverId);
  }
}
