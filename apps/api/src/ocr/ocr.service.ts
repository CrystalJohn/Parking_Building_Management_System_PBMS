import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { PlateRecognitionService } from '../plate-recognition/plate-recognition.service';
import { OcrEvidenceStorageService } from '../ocr-evidences/ocr-evidence-storage.service';
import type { OcrRecognizeInput, OcrRecognizeResponse, PlateBox, UploadedOcrImage } from './ocr.types';

type EvidenceRecord = {
  id: string;
  provider: string;
  providerFilename: string | null;
  providerTimestamp: Date | string | null;
  imageKey: string | null;
  thumbnailKey: string | null;
  imageMimeType: string | null;
  imageSizeBytes: number | null;
  imageSha256: string | null;
  imageExpiresAt: Date | null;
  thumbnailExpiresAt: Date | null;
  imageDeletedAt: Date | null;
  thumbnailDeletedAt: Date | null;
  cameraId: string | null;
  rawResponse?: unknown;
  plateBox: unknown;
  ocrPlate: string | null;
  ocrConfidence: number | null;
  confirmedPlate?: string | null;
  vehicleType: string | null;
  buildingName: string | null;
  gateName: string | null;
  errorMessage: string | null;
  capturedAt?: Date | string;
  checkInTime?: Date | string | null;
  staffId?: string | null;
  reservationId?: string | null;
  sessionId?: string | null;
};

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly plateRecognitionService: PlateRecognitionService,
    private readonly config: ConfigService,
    private readonly storageService: OcrEvidenceStorageService,
  ) {}

  async recognize(
    file: UploadedOcrImage,
    input: OcrRecognizeInput,
    staffId: string,
  ): Promise<OcrRecognizeResponse> {
    const startedAt = Date.now();
    const eventType = input.eventType ?? 'check_in';
    const cameraId = input.cameraId || this.config.get<string>('PLATE_RECOGNIZER_CAMERA_ID') || null;
    const buildingName = input.buildingName || this.config.get<string>('PBMS_BUILDING_NAME') || 'PBMS Building';
    const gateName = input.gateName || this.config.get<string>('PBMS_GATE_NAME') || 'Main Gate';

    try {
      const scan = await this.plateRecognitionService.recognize(file.buffer, file.mimetype);
      const providerTimestamp = parseOptionalDate(scan.providerTimestamp);

      const evidence = await this.createEvidenceWithImage({
        eventType,
        provider: 'PLATE_RECOGNIZER',
        providerFilename: scan.providerFilename ?? null,
        providerTimestamp,
        cameraId,
        rawResponse: scan.rawResponse ?? null,
        plateBox: scan.plateBox ?? null,
        ocrPlate: scan.plate,
        ocrConfidence: scan.plate ? scan.score : null,
        vehicleType: scan.vehicleType,
        buildingName,
        gateName,
        errorMessage: scan.plate ? null : 'No plate detected',
        staffId,
        reservationId: input.reservationId || null,
      }, file.buffer, file.mimetype);

      return this.toResponse(evidence, Date.now() - startedAt);
    } catch (error) {
      const message = getErrorMessage(error);
      this.logger.error(`OCR recognize failed: ${message}`, error instanceof Error ? error.stack : undefined);

      const evidence = await this.createEvidenceWithImage({
        eventType,
        provider: 'PLATE_RECOGNIZER',
        providerFilename: null,
        providerTimestamp: null,
        cameraId,
        rawResponse: null,
        plateBox: null,
        ocrPlate: null,
        ocrConfidence: null,
        vehicleType: null,
        buildingName,
        gateName,
        errorMessage: message,
        staffId,
        reservationId: input.reservationId || null,
      }, file.buffer, file.mimetype);

      return this.toResponse(evidence, Date.now() - startedAt);
    }
  }

  async linkEvidenceToCheckout(
    ocrEvidenceId: string,
    sessionId: string,
    confirmedPlate: string,
  ): Promise<void> {
    try {
      await (this.prisma as any).ocrEvidence.update({
        where: { id: ocrEvidenceId },
        data: {
          eventType: 'check_out',
          sessionId,
          confirmedPlate,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to link evidence ${ocrEvidenceId} to checkout session ${sessionId}: ${(error as Error).message}`,
      );
    }
  }

  async findEvidence(id: string) {
    const evidence = await (this.prisma as any).ocrEvidence.findUnique({
      where: { id },
      include: {
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

  async getCheckInEvidenceForSession(sessionId: string) {
    const evidence = await (this.prisma as any).ocrEvidence.findFirst({
      where: {
        sessionId,
        eventType: 'check_in',
      },
      select: {
        id: true,
        thumbnailKey: true,
        imageKey: true,
        capturedAt: true,
        ocrPlate: true,
        ocrConfidence: true,
        providerFilename: true,
      },
      orderBy: { capturedAt: 'desc' },
    });

    return evidence;
  }

  private async createEvidenceWithImage(
    data: Record<string, unknown>,
    imageBuffer: Buffer,
    mimeType: string,
  ): Promise<EvidenceRecord> {
    const retentionDays = this.config.get<number>('OCR_FULL_IMAGE_RETENTION_DAYS', 30);
    const thumbnailRetentionDays = this.config.get<number>('OCR_THUMBNAIL_RETENTION_DAYS', 90);

    const evidence = await (this.prisma as any).ocrEvidence.create({
      data,
    });

    let imageMeta: Awaited<ReturnType<OcrEvidenceStorageService['saveImage']>> | null = null;

    try {
      imageMeta = await this.storageService.saveImage(
        evidence.id,
        imageBuffer,
        mimeType,
      );

      const now = new Date();
      const fullExpiresAt = new Date(now.getTime() + retentionDays * 24 * 60 * 60 * 1000);
      const thumbExpiresAt = new Date(now.getTime() + thumbnailRetentionDays * 24 * 60 * 60 * 1000);

      return (this.prisma as any).ocrEvidence.update({
        where: { id: evidence.id },
        data: {
          imageKey: imageMeta.imageKey,
          thumbnailKey: imageMeta.thumbnailKey,
          imageMimeType: imageMeta.imageMimeType,
          imageSizeBytes: imageMeta.imageSizeBytes,
          imageSha256: imageMeta.imageSha256,
          imageExpiresAt: fullExpiresAt,
          thumbnailExpiresAt: thumbExpiresAt,
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to save OCR evidence image metadata, cleaning up files: ${(err as Error).message}`);
      if (imageMeta) {
        await this.storageService.deleteEvidenceFiles(imageMeta.imageKey, imageMeta.thumbnailKey);
      }
      return evidence;
    }
  }

  private toResponse(evidence: EvidenceRecord, durationMs: number): OcrRecognizeResponse {
    return {
      ocrEvidenceId: evidence.id,
      detectedPlate: evidence.ocrPlate,
      confidence: evidence.ocrConfidence,
      vehicleTypePrediction: evidence.vehicleType,
      provider: 'PLATE_RECOGNIZER',
      providerFilename: evidence.providerFilename,
      providerTimestamp: formatOptionalDate(evidence.providerTimestamp),
      imageUrl: evidence.imageKey ? `/api/ocr-evidences/${evidence.id}/image` : null,
      thumbnailUrl: evidence.thumbnailKey ? `/api/ocr-evidences/${evidence.id}/thumbnail` : null,
      imageMimeType: evidence.imageMimeType,
      imageSizeBytes: evidence.imageSizeBytes,
      cameraId: evidence.cameraId,
      plateBox: normalizePlateBox(evidence.plateBox),
      buildingName: evidence.buildingName || 'PBMS Building',
      gateName: evidence.gateName || 'Main Gate',
      error: evidence.errorMessage,
      durationMs,
    };
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'OCR failed';
}

function parseOptionalDate(value?: string | Date | null): Date | null {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatOptionalDate(value?: string | Date | null): string | null {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizePlateBox(value: unknown): PlateBox | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const box = value as Partial<PlateBox>;
  if (
    typeof box.xmin === 'number' &&
    typeof box.ymin === 'number' &&
    typeof box.xmax === 'number' &&
    typeof box.ymax === 'number'
  ) {
    return {
      xmin: box.xmin,
      ymax: box.ymax,
      xmax: box.xmax,
      ymin: box.ymin,
    };
  }
  return null;
}
