import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles } from '../auth/decorators';
import { PlateRecognitionService } from './plate-recognition.service';

// Plate photos are small JPEG/PNG frames; cap to avoid abuse.
const MAX_UPLOAD_BYTES = 6 * 1024 * 1024; // 6 MB

/** Minimal shape of a Multer uploaded file (avoids a @types/multer dependency). */
interface UploadedImage {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname: string;
}

@Controller('plate-recognition')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.staff, Role.manager, Role.admin)
export class PlateRecognitionController {
  constructor(
    private readonly plateRecognitionService: PlateRecognitionService,
  ) {}

  /**
   * POST /plate-recognition/scan
   * Accepts a single image frame (multipart field "image") captured from the
   * camera and returns the recognized Vietnamese license plate.
   */
  @Post('scan')
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: MAX_UPLOAD_BYTES },
    }),
  )
  async scan(@UploadedFile() file?: UploadedImage) {
    if (!file || !file.buffer?.length) {
      throw new BadRequestException('Thiếu ảnh để nhận diện (field "image")');
    }
    if (!file.mimetype?.startsWith('image/')) {
      throw new BadRequestException('File tải lên không phải ảnh');
    }

    return this.plateRecognitionService.recognize(file.buffer, file.mimetype);
  }
}
