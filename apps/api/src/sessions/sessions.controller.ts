import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles, CurrentUser } from '../auth/decorators';
import { SessionsService } from './sessions.service';
import { CheckInDto } from './dto';

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
