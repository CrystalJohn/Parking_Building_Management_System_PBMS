import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { CurrentUser, Roles } from '../auth/decorators';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { OcrService } from './ocr.service';
import { GateLanesService } from '../gate-lanes/gate-lanes.service';
import type { OcrRecognizeInput, UploadedOcrImage } from './ocr.types';

const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;

@Controller('ocr')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.staff, Role.manager, Role.admin)
export class OcrController {
  constructor(
    private readonly ocrService: OcrService,
    private readonly gateLanesService: GateLanesService,
  ) {}

  @Post('recognize')
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: MAX_UPLOAD_BYTES },
    }),
  )
  async recognize(
    @UploadedFile() file: UploadedOcrImage | undefined,
    @Body() body: OcrRecognizeInput,
    @CurrentUser('id') staffId: string,
    @CurrentUser('role') role: Role,
  ): Promise<unknown> {
    if (role === Role.staff) {
      await this.gateLanesService.requireActiveLane(staffId);
    }
    if (!file?.buffer?.length) {
      throw new BadRequestException('Missing OCR image file in field "image"');
    }

    if (!file.mimetype?.startsWith('image/')) {
      throw new BadRequestException('Uploaded OCR file must be an image');
    }

    return this.ocrService.recognize(file, body, staffId);
  }
}
