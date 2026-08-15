import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
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
   * 15.4: Staff only — confirm payment and authorize exit.
   * Slot release happens only after confirm-exit.
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
   * POST /sessions/:id/confirm-exit
   * Staff only — confirm the vehicle actually exited, then release slot.
   */
  @Post(':id/confirm-exit')
  @UseGuards(RolesGuard)
  @Roles(Role.staff)
  confirmExit(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') staffId: string,
  ) {
    return this.sessionsService.confirmExit(id, staffId);
  }

  /**
   * POST /sessions/:id/ticket/issue
   * Staff confirms a software-generated ticket was issued to the walk-in driver.
   */
  @Post(':id/ticket/issue')
  @UseGuards(RolesGuard)
  @Roles(Role.staff)
  issueTicket(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') staffId: string,
  ) {
    return this.sessionsService.issueTicket(id, staffId);
  }

  /**
   * GET /sessions/active
   * Staff and Manager — list all active sessions.
   * Manager uses this for read-only slot inspection on the dashboard.
   * NOTE: must be declared before :id to avoid route conflict.
   */
  @Get('active')
  @UseGuards(RolesGuard)
  @Roles(Role.staff, Role.manager)
  findActive() {
    return this.sessionsService.findActive();
  }

  /**
   * GET /sessions/recent?type=checkin|checkout&limit=20
   * Staff only — recent check-in or check-out history for the gate UI history card.
   */
  @Get('recent')
  @UseGuards(RolesGuard)
  @Roles(Role.staff)
  findRecent(
    @Query('type') type?: 'checkin' | 'checkout',
    @Query('limit') limit?: string,
    @CurrentUser('id') staffId?: string,
  ) {
    return this.sessionsService.findRecent(type, Number(limit) || 20, staffId);
  }

  /**
   * GET /sessions/checkout-lookup?sessionCode=... or ?licensePlate=...
   * Staff only — read-only lookup for checkout workflow.
   */
  @Get('checkout-lookup')
  @UseGuards(RolesGuard)
  @Roles(Role.staff)
  lookupForCheckout(
    @Query('sessionCode') sessionCode?: string,
    @Query('licensePlate') licensePlate?: string,
    @CurrentUser('id') staffId?: string,
  ) {
    return this.sessionsService.lookupForCheckout({ sessionCode, licensePlate }, staffId!);
  }

  @Get('lookup')
  @UseGuards(RolesGuard)
  @Roles(Role.staff)
  lookupSessionStatus(@Query('query') query?: string) {
    return this.sessionsService.lookupSessionStatus(query);
  }

  /**
   * GET /sessions/my-active
   * Driver only — list own active sessions.
   * 23.4
   */
  @Get('my-active')
  @UseGuards(RolesGuard)
  @Roles(Role.driver)
  findMyActive(@CurrentUser('id') driverId: string) {
    return this.sessionsService.findByDriver(driverId, 'active');
  }

  /**
   * GET /sessions/my-history
   * Driver only — list own completed sessions.
   * 23.3
   */
  @Get('my-history')
  @UseGuards(RolesGuard)
  @Roles(Role.driver)
  findMyHistory(@CurrentUser('id') driverId: string) {
    return this.sessionsService.findByDriver(driverId, 'completed');
  }

  /**
   * GET /sessions/:id/qr
   * 21: Get QR code for a session (data URL).
   * Staff and Driver — returns base64 PNG data URL.
   */
  @Get(':id/qr')
  @Roles(Role.staff, Role.driver)
  getQrCode(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: Role,
  ) {
    return this.sessionsService.getQrCode(id, userId, role);
  }

  /**
   * GET /sessions/:id
   * Staff and Driver — get session details.
   */
  @Get(':id')
  @Roles(Role.staff, Role.driver)
  findOne(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: Role,
  ) {
    return this.sessionsService.findOne(id, userId, role);
  }
}
