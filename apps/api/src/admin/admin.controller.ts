import {
  Controller,
  Get,
  UseGuards,
  Query,
  BadRequestException,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.admin, Role.manager)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('summary')
  getSummary(@Query('date') dateStr?: string) {
    return this.adminService.getSummary(this.parseAuditDate(dateStr));
  }

  @Get('reservations/audit')
  getReservationAudit(@Query('date') dateStr?: string) {
    return this.adminService.getReservationAudit(this.parseAuditDate(dateStr));
  }

  @Get('operations/flags')
  getOperationsFlags() {
    return this.adminService.getOperationsFlags();
  }

  @Get('operations/pending-payments')
  getPendingPayments() {
    return this.adminService.getPendingPayments();
  }

  @Get('operations/slot-occupancy-map')
  getSlotOccupancyMap() {
    return this.adminService.getSlotOccupancyMap();
  }

  @Get('sessions/:sessionId/evidence')
  getSessionEvidence(@Param('sessionId', ParseUUIDPipe) sessionId: string) {
    return this.adminService.getSessionEvidence(sessionId);
  }

  private parseAuditDate(dateStr?: string) {
    let targetDate = new Date();

    if (dateStr) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        throw new BadRequestException('Invalid date format. Expected YYYY-MM-DD');
      }

      const parsedDate = new Date(dateStr);
      if (isNaN(parsedDate.getTime())) {
        throw new BadRequestException('Invalid date string');
      }

      const now = new Date();
      const diffTime = now.getTime() - parsedDate.getTime();
      const diffDays = diffTime / (1000 * 60 * 60 * 24);

      if (diffDays < -1) {
        throw new BadRequestException('Date cannot be in the future');
      }
      if (diffDays > 31) {
        throw new BadRequestException('Date cannot be older than 30 days');
      }

      targetDate = parsedDate;
    }

    return targetDate;
  }
}
