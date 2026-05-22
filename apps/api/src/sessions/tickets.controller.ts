import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles, CurrentUser } from '../auth/decorators';
import { SessionsService } from './sessions.service';
import { LostTicketDto } from './dto';

/**
 * 24: Lost ticket handling controller.
 * Separate controller to mount at /tickets (not /sessions).
 */
@Controller('tickets')
@UseGuards(JwtAuthGuard)
export class TicketsController {
  constructor(private readonly sessionsService: SessionsService) {}

  /**
   * POST /tickets/lost
   * 24.1: Staff only — process lost ticket with ID verification.
   * Req 5.6, 7.3
   */
  @Post('lost')
  @UseGuards(RolesGuard)
  @Roles(Role.staff)
  handleLostTicket(
    @Body() dto: LostTicketDto,
    @CurrentUser('id') staffId: string,
  ) {
    return this.sessionsService.handleLostTicket(dto, staffId);
  }
}
