import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles, CurrentUser } from '../auth/decorators';
import { SessionsService } from './sessions.service';
import { CheckInDto, CheckOutDto, ConfirmPaymentDto } from './dto';

@Controller('sessions')
@UseGuards(JwtAuthGuard)
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  /**
   * POST /sessions/check-in
   * Staff only — check in a vehicle, assign slot, optionally generate QR.
   * Req 1.1–1.5, 3.6
   */
  @Post('check-in')
  @UseGuards(RolesGuard)
  @Roles(Role.staff)
  checkIn(
    @Body() dto: CheckInDto,
    @CurrentUser('id') staffId: string,
  ) {
    return this.sessionsService.checkIn(dto, staffId);
  }

  /**
   * POST /sessions/check-out
   * 15.1: Staff only — initiate check-out, return fee breakdown.
   * Accepts {session_id} (from QR) or {license_plate}.
   * Req 2.1–2.3
   */
  @Post('check-out')
  @UseGuards(RolesGuard)
  @Roles(Role.staff)
  checkOut(
    @Body() dto: CheckOutDto,
    @CurrentUser('id') staffId: string,
  ) {
    return this.sessionsService.checkOut(dto, staffId);
  }

  /**
   * POST /sessions/:id/confirm-payment
   * 15.4: Staff only — confirm payment, complete session, release slot.
   * Req 2.4, 6.2, 6.4
   */
  @Post(':id/confirm-payment')
  @UseGuards(RolesGuard)
  @Roles(Role.staff)
  confirmPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmPaymentDto,
    @CurrentUser('id') staffId: string,
  ) {
    return this.sessionsService.confirmPayment(id, dto, staffId);
  }

  /**
   * GET /sessions/active
   * Staff only — list all active sessions.
   * NOTE: must be declared before :id to avoid route conflict.
   */
  @Get('active')
  @UseGuards(RolesGuard)
  @Roles(Role.staff)
  findActive() {
    return this.sessionsService.findActive();
  }

  /**
   * GET /sessions/:id
   * Staff and Driver — get session details.
   */
  @Get(':id')
  @Roles(Role.staff, Role.driver)
  findOne(@Param('id') id: string) {
    return this.sessionsService.findOne(id);
  }
}
