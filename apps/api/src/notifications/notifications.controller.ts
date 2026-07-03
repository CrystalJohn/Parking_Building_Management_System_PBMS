import { Controller, Get, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser, Roles } from '../auth/decorators';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('my')
  @Roles(Role.driver)
  findMyNotifications(@CurrentUser('id') driverId: string) {
    return this.notificationsService.listForUser(driverId);
  }
}
