import { Controller, Get, UseGuards } from '@nestjs/common';
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
  getSummary() {
    return this.adminService.getSummary();
  }

  @Get('operations/flags')
  getOperationsFlags() {
    return this.adminService.getOperationsFlags();
  }

  @Get('operations/pending-payments')
  getPendingPayments() {
    return this.adminService.getPendingPayments();
  }
}
