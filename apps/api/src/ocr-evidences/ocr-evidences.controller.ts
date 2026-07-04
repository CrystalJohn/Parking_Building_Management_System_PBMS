import {
  Controller,
  Get,
  Param,
  Res,
  NotFoundException,
  GoneException,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Response } from 'express';
import * as fs from 'fs';
import { CurrentUser, Roles } from '../auth/decorators';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { OcrEvidencesService } from './ocr-evidences.service';

@Controller('ocr-evidences')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.staff, Role.manager, Role.admin)
export class OcrEvidencesController {
  constructor(private readonly ocrEvidencesService: OcrEvidencesService) {}

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ocrEvidencesService.findOne(id);
  }

  @Get(':id/image')
  async getImage(@Param('id') id: string, @Res() res: Response) {
    const evidence = await this.ocrEvidencesService.findOne(id);

    if (!evidence.imageKey && evidence.imageDeletedAt) {
      throw new GoneException('Full image has been deleted after retention expiry');
    }

    if (!evidence.imageKey) {
      throw new NotFoundException('Full image not available for this OCR evidence');
    }

    const filePath = this.ocrEvidencesService.getImagePath(evidence.imageKey);
    this.streamFile(filePath, evidence.imageMimeType ?? 'image/jpeg', res);
  }

  @Get(':id/thumbnail')
  async getThumbnail(@Param('id') id: string, @Res() res: Response) {
    const evidence = await this.ocrEvidencesService.findOne(id);

    if (!evidence.thumbnailKey && evidence.thumbnailDeletedAt) {
      throw new GoneException('Thumbnail has been deleted after retention expiry');
    }

    if (!evidence.thumbnailKey) {
      if (evidence.imageKey && !evidence.imageDeletedAt) {
        const filePath = this.ocrEvidencesService.getImagePath(evidence.imageKey);
        this.streamFile(filePath, evidence.imageMimeType ?? 'image/jpeg', res);
        return;
      }
      throw new NotFoundException('Thumbnail not available for this OCR evidence');
    }

    const filePath = this.ocrEvidencesService.getThumbnailPath(evidence.thumbnailKey);
    this.streamFile(filePath, 'image/jpeg', res);
  }

  private streamFile(filePath: string, mimeType: string, res: Response) {
    try {
      if (!fs.existsSync(filePath)) {
        throw new NotFoundException('Image file not found on disk');
      }

      const stat = fs.statSync(filePath);
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Length', stat.size);
      res.setHeader('Cache-Control', 'private, max-age=3600');

      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
    } catch (err) {
      if (err instanceof NotFoundException || err instanceof GoneException) throw err;
      throw new NotFoundException('Image file not found on disk');
    }
  }
}
