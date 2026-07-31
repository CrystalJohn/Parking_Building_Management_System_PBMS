import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OcrEvidenceStorageService } from './ocr-evidence-storage.service';

@Injectable()
export class OcrEvidencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: OcrEvidenceStorageService,
  ) {}

  async findOne(id: string) {
    const evidence = await this.prisma.ocrEvidence.findUnique({
      where: { id },
      select: {
        id: true,
        eventType: true,
        provider: true,
        providerFilename: true,
        providerTimestamp: true,
        cameraId: true,
        plateBox: true,
        ocrPlate: true,
        rawPlate: true,
        canonicalPlate: true,
        displayPlate: true,
        ocrConfidence: true,
        confirmedPlate: true,
        vehicleType: true,
        buildingName: true,
        gateName: true,
        errorMessage: true,
        imageKey: true,
        thumbnailKey: true,
        imageMimeType: true,
        imageSizeBytes: true,
        imageSha256: true,
        imageExpiresAt: true,
        imageDeletedAt: true,
        thumbnailExpiresAt: true,
        thumbnailDeletedAt: true,
        capturedAt: true,
        checkInTime: true,
        staff: { select: { id: true, phone: true, fullName: true } },
        session: {
          select: {
            id: true,
            sessionCode: true,
            licensePlate: true,
            vehicleType: true,
            checkInTime: true,
            status: true,
          },
        },
        reservation: {
          select: {
            id: true,
            vehicleType: true,
            status: true,
            expiresAt: true,
          },
        },
      },
    });

    if (!evidence) {
      throw new NotFoundException(`OCR evidence not found: ${id}`);
    }

    return evidence;
  }

  getImagePath(imageKey: string): string {
    return this.storage.getImageAbsolutePath(imageKey);
  }

  getThumbnailPath(thumbnailKey: string): string {
    return this.storage.getThumbnailAbsolutePath(thumbnailKey);
  }
}
