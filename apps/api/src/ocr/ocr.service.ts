import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { PlateRecognitionService } from '../plate-recognition/plate-recognition.service';
import type { OcrRecognizeInput, OcrRecognizeResponse, PlateBox, UploadedOcrImage } from './ocr.types';

type EvidenceRecord = {
  id: string;
  provider: string;
  providerFilename: string | null;
  providerTimestamp: Date | string | null;
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly plateRecognitionService: PlateRecognitionService,
    private readonly config: ConfigService,
  ) {}

  async recognize(
    file: UploadedOcrImage,
    input: OcrRecognizeInput,
    staffId: string,
  ): Promise<OcrRecognizeResponse> {
    const startedAt = Date.now();
    const cameraId = input.cameraId || this.config.get<string>('PLATE_RECOGNIZER_CAMERA_ID') || null;
    const buildingName = input.buildingName || this.config.get<string>('PBMS_BUILDING_NAME') || 'PBMS Building';
    const gateName = input.gateName || this.config.get<string>('PBMS_GATE_NAME') || 'Main Gate';

    try {
      const scan = await this.plateRecognitionService.recognize(file.buffer, file.mimetype);
      const providerTimestamp = parseOptionalDate(scan.providerTimestamp);
      const evidence = await this.createEvidence({
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
      });

      return this.toResponse(evidence, Date.now() - startedAt);
    } catch (error) {
      const message = getErrorMessage(error);
      const evidence = await this.createEvidence({
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
      });

      return this.toResponse(evidence, Date.now() - startedAt);
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

  private async createEvidence(data: Record<string, unknown>): Promise<EvidenceRecord> {
    return (this.prisma as any).ocrEvidence.create({ data });
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
      ymin: box.ymin,
      xmax: box.xmax,
      ymax: box.ymax,
    };
  }
  return null;
}
