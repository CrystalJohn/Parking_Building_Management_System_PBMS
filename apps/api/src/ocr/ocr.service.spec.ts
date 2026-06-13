import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OcrService } from './ocr.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlateRecognitionService } from '../plate-recognition/plate-recognition.service';

describe('OcrService', () => {
  let service: OcrService;
  let prisma: {
    ocrEvidence: {
      create: jest.Mock;
      findUnique: jest.Mock;
    };
  };
  let plateRecognitionService: { recognize: jest.Mock };

  beforeEach(async () => {
    prisma = {
      ocrEvidence: {
        create: jest.fn(),
        findUnique: jest.fn(),
      },
    };
    plateRecognitionService = {
      recognize: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OcrService,
        { provide: PrismaService, useValue: prisma },
        { provide: PlateRecognitionService, useValue: plateRecognitionService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'PBMS_BUILDING_NAME') return 'PBMS Building';
              if (key === 'PBMS_GATE_NAME') return 'Main Gate';
              if (key === 'PLATE_RECOGNIZER_CAMERA_ID') return 'gate-cam-1';
              return undefined;
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
    prisma.ocrEvidence.create.mockResolvedValue({
      id: 'evidence-1',
      provider: 'PLATE_RECOGNIZER',
      providerFilename: 'snapshot-1.jpg',
      providerTimestamp: new Date('2026-06-13T03:00:00Z'),
      cameraId: 'gate-cam-1',
      rawResponse: { results: [{ plate: '51a12345' }] },
      plateBox: { xmin: 10, ymin: 20, xmax: 110, ymax: 80 },
      ocrPlate: '51A-12345',
      ocrConfidence: 0.98,
      vehicleType: 'Sedan',
      buildingName: 'PBMS Building',
      gateName: 'Main Gate',
      errorMessage: null,
      capturedAt: new Date('2026-06-13T03:00:00Z'),
    });

    const result = await service.recognize(
      { buffer: Buffer.from('image'), mimetype: 'image/jpeg', originalname: 'frame.jpg', size: 5 },
      {},
      'staff-1',
    );

    expect(prisma.ocrEvidence.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
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
      confidence: 0.98,
      vehicleTypePrediction: 'Sedan',
      provider: 'PLATE_RECOGNIZER',
      providerFilename: 'snapshot-1.jpg',
      cameraId: 'gate-cam-1',
      plateBox: { xmin: 10, ymin: 20, xmax: 110, ymax: 80 },
      error: null,
    });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('stores OCR failure metadata and returns an error result without creating a session', async () => {
    plateRecognitionService.recognize.mockRejectedValue(new Error('provider unavailable'));
    prisma.ocrEvidence.create.mockResolvedValue({
      id: 'evidence-failed',
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
    });

    const result = await service.recognize(
      { buffer: Buffer.from('image'), mimetype: 'image/jpeg', originalname: 'frame.jpg', size: 5 },
      {},
      'staff-1',
    );

    expect(prisma.ocrEvidence.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
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
    });
  });
});
