import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { CurrentUser, Roles } from '../auth/decorators';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { UploadedOcrImage } from '../ocr/ocr.types';
import { ResolvePlateDto, ScanPlateDto, VerifyPlateDto, RecordGateAuditDto } from './dto';
import { GateService } from './gate.service';

const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;

@Controller('gate')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.staff)
export class GateController {
  constructor(private readonly gateService: GateService) {}

  @Post('scan-plate')
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: MAX_UPLOAD_BYTES },
    }),
  )
  scanPlate(
    @UploadedFile() file: UploadedOcrImage | undefined,
    @Body() body: ScanPlateDto,
    @CurrentUser('id') staffId: string,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Missing OCR image file in field "image"');
    }

    if (!file.mimetype?.startsWith('image/')) {
      throw new BadRequestException('Uploaded OCR file must be an image');
    }

    return this.gateService.scanPlate(file, body, staffId);
  }

  @Post('resolve-plate')
  @HttpCode(HttpStatus.OK)
  resolvePlate(@Body() dto: ResolvePlateDto, @CurrentUser('id') staffId: string) {
    return this.gateService.resolvePlate(dto, staffId);
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  verifyPlate(@Body() dto: VerifyPlateDto, @CurrentUser('id') staffId: string) {
    return this.gateService.verifyPlate({
      canonicalPlate: dto.canonicalPlate,
      ocrEvidenceId: dto.ocrEvidenceId,
      staffId,
    });
  }

  @Post('audit-log')
  recordOverride(@Body() dto: RecordGateAuditDto, @CurrentUser('id') staffId: string) {
    return this.gateService.recordOverride({
      canonicalPlate: dto.canonicalPlate,
      vehicleStatus: dto.vehicleStatus,
      recommendedAction: dto.recommendedAction,
      actualAction: dto.actualAction,
      reason: dto.reason,
      sessionId: dto.sessionId,
      reservationId: dto.reservationId,
      staffId,
    });
  }
}
