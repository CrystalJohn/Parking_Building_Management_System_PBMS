import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles } from '../auth/decorators';
import { FeesService } from './fees.service';

@Controller('fees')
@UseGuards(JwtAuthGuard)
export class FeesController {
  constructor(private readonly feesService: FeesService) {}

  /**
   * GET /fees/calculate/:session_id
   * 14.6: Staff preview — calculate fee without persisting.
   * Query param ?lost=true to include lost ticket penalty.
   */
  @Get('calculate/:session_id')
  @UseGuards(RolesGuard)
  @Roles(Role.staff)
  calculate(
    @Param('session_id', ParseUUIDPipe) sessionId: string,
    @Query('lost') lost?: string,
  ) {
    const isLost = lost === 'true';
    return this.feesService.preview(sessionId, isLost);
  }
}
