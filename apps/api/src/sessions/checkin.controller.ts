import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser, Roles } from '../auth/decorators';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { CheckInDto, ConfirmReservationCheckInDto, ScanReservationDto } from './dto';
import { SessionsService } from './sessions.service';

@Controller('checkin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.staff)
export class CheckinController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Post('confirm')
  confirm(@Body() dto: CheckInDto, @CurrentUser('id') staffId: string) {
    console.log('[GATE_TRACE] CheckinController.confirm (POST /checkin/confirm request body)', {
      sessionCode: '-',
      plate: dto.licensePlate,
      ocrEvidenceId: dto.ocrEvidenceId ?? null,
      vehicleStatus: '-',
    })
    return this.sessionsService.checkIn(dto, staffId);
  }

  @Post('scan-reservation')
  scanReservation(@Body() dto: ScanReservationDto) {
    return this.sessionsService.scanReservation(dto.token);
  }

  @Post('confirm-reservation')
  confirmReservation(
    @Body() dto: ConfirmReservationCheckInDto,
    @CurrentUser('id') staffId: string,
  ) {
    return this.sessionsService.confirmReservationCheckIn(dto.reservationId, staffId);
  }
}
