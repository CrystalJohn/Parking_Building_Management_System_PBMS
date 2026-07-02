import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser, Roles } from '../auth/decorators';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { CheckInDto } from './dto';
import { SessionsService } from './sessions.service';

@Controller('checkin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.staff)
export class CheckinController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Post('confirm')
  confirm(@Body() dto: CheckInDto, @CurrentUser('id') staffId: string) {
    return this.sessionsService.checkIn(dto, staffId);
  }
}
