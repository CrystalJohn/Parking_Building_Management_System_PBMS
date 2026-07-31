import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OcrService } from './ocr.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlateRecognitionService } from '../plate-recognition/plate-recognition.service';
import { OcrEvidenceStorageService } from '../ocr-evidences/ocr-evidence-storage.service';

describe('OcrService', () => {
  let service: OcrService;
  let prisma: {
    ocrEvidence: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      findFirst: jest.Mock;
    };
  };
  let plateRecognitionService: { recognize: jest.Mock };
  let storage: {
    saveImage: jest.Mock;
    deleteEvidenceFiles: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      ocrEvidence: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn(),
      },
    };
    plateRecognitionService = {
      recognize: jest.fn(),
    };
    storage = {
      saveImage: jest.fn(),
      deleteEvidenceFiles: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OcrService,
        { provide: PrismaService, useValue: prisma },
        { provide: PlateRecognitionService, useValue: plateRecognitionService },
        { provide: OcrEvidenceStorageService, useValue: storage },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              if (key === 'PBMS_BUILDING_NAME') return 'PBMS Building';
              if (key === 'PBMS_GATE_NAME') return 'Main Gate';
              if (key === 'PLATE_RECOGNIZER_CAMERA_ID') return 'gate-cam-1';
              return defaultValue ?? undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<OcrService>(OcrService);
  });

  it('stores OCR success metadata and returns normalized result', async () => {
    plateRecognitionService.recognize.mockResolvedValue({
      plate: '51A-12345',
      rawPlate: '51a12345',
      canonicalPlate: '51A12345',
      displayPlate: '51A-123.45',
      score: 0.98,
      dscore: 0.96,
      region: 'vn',
      candidates: [{ plate: '51A-12345', score: 0.98 }],
      vehicleType: 'Sedan',
      processingTime: 412,
      providerFilename: 'snapshot-1.jpg',
      providerTimestamp: '2026-06-13T03:00:00Z',
      plateBox: { xmin: 10, ymin: 20, xmax: 110, ymax: 80 },
      rawResponse: { results: [{ plate: '51a12345' }] },
    });
    const createResult = {
      id: 'evidence-1',
      eventType: 'check_in',
      provider: 'PLATE_RECOGNIZER',
      providerFilename: 'snapshot-1.jpg',
      providerTimestamp: new Date('2026-06-13T03:00:00Z'),
      cameraId: 'gate-cam-1',
      rawResponse: { results: [{ plate: '51a12345' }] },
      plateBox: { xmin: 10, ymin: 20, xmax: 110, ymax: 80 },
      ocrPlate: '51A-12345',
      rawPlate: '51a12345',
      canonicalPlate: '51A12345',
      displayPlate: '51A-123.45',
      ocrConfidence: 0.98,
      vehicleType: 'Sedan',
      buildingName: 'PBMS Building',
      gateName: 'Main Gate',
      errorMessage: null,
      capturedAt: new Date('2026-06-13T03:00:00Z'),
      imageKey: '2026/06/13/evidence-1.jpg',
      thumbnailKey: '2026/06/13/evidence-1-thumb.jpg',
      imageMimeType: 'image/jpeg',
      imageSizeBytes: 12345,
      imageSha256: 'abc123',
      imageExpiresAt: new Date('2026-07-13T03:00:00Z'),
      thumbnailExpiresAt: new Date('2026-09-11T03:00:00Z'),
      imageDeletedAt: null,
      thumbnailDeletedAt: null,
    };
    prisma.ocrEvidence.create.mockResolvedValue(createResult);
    storage.saveImage.mockResolvedValue({
      imageKey: '2026/06/13/evidence-1.jpg',
      thumbnailKey: '2026/06/13/evidence-1-thumb.jpg',
      imageMimeType: 'image/jpeg',
      imageSizeBytes: 12345,
      imageSha256: 'abc123',
    });
    prisma.ocrEvidence.update.mockResolvedValue(createResult);

    const result = await service.recognize(
      { buffer: Buffer.from('image'), mimetype: 'image/jpeg', originalname: 'frame.jpg', size: 5 },
      {},
      'staff-1',
    );

    expect(prisma.ocrEvidence.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: 'check_in',
        provider: 'PLATE_RECOGNIZER',
        ocrPlate: '51A-12345',
        ocrConfidence: 0.98,
        staffId: 'staff-1',
        errorMessage: null,
      }),
    });
    expect(result).toMatchObject({
      ocrEvidenceId: 'evidence-1',
      detectedPlate: '51A-12345',
      rawPlate: '51a12345',
      canonicalPlate: '51A12345',
      displayPlate: '51A-123.45',
      confidence: 0.98,
      vehicleTypePrediction: 'Sedan',
      provider: 'PLATE_RECOGNIZER',
      providerFilename: 'snapshot-1.jpg',
      imageUrl: '/api/ocr-evidences/evidence-1/image',
      thumbnailUrl: '/api/ocr-evidences/evidence-1/thumbnail',
      cameraId: 'gate-cam-1',
      plateBox: { xmin: 10, ymin: 20, xmax: 110, ymax: 80 },
      error: null,
    });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('stores OCR failure metadata and returns an error result without creating a session', async () => {
    plateRecognitionService.recognize.mockRejectedValue(new Error('provider unavailable'));
    const failResult = {
      id: 'evidence-failed',
      eventType: 'check_in',
      provider: 'PLATE_RECOGNIZER',
      providerFilename: null,
      providerTimestamp: null,
      cameraId: 'gate-cam-1',
      rawResponse: null,
      plateBox: null,
      ocrPlate: null,
      ocrConfidence: null,
      vehicleType: null,
      buildingName: 'PBMS Building',
      gateName: 'Main Gate',
      errorMessage: 'provider unavailable',
      capturedAt: new Date('2026-06-13T03:00:00Z'),
      imageKey: null,
      thumbnailKey: null,
      imageMimeType: null,
      imageSizeBytes: null,
      imageSha256: null,
      imageExpiresAt: null,
      thumbnailExpiresAt: null,
      imageDeletedAt: null,
      thumbnailDeletedAt: null,
    };
    prisma.ocrEvidence.create.mockResolvedValue(failResult);

    const result = await service.recognize(
      { buffer: Buffer.from('image'), mimetype: 'image/jpeg', originalname: 'frame.jpg', size: 5 },
      {},
      'staff-1',
    );

    expect(prisma.ocrEvidence.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: 'check_in',
        ocrPlate: null,
        ocrConfidence: null,
        errorMessage: 'provider unavailable',
        staffId: 'staff-1',
      }),
    });
    expect(result).toMatchObject({
      ocrEvidenceId: 'evidence-failed',
      detectedPlate: null,
      confidence: null,
      error: 'provider unavailable',
      imageUrl: null,
      thumbnailUrl: null,
    });
  });
});
