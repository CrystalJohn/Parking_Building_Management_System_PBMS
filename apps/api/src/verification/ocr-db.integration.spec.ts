import 'dotenv/config';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OcrService } from '../ocr/ocr.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlateRecognitionService } from '../plate-recognition/plate-recognition.service';
import { OcrEvidenceStorageService } from '../ocr-evidences/ocr-evidence-storage.service';

/**
 * Integration verification: OCR -> API pipeline -> Database persistence.
 * Requires a LOCAL PostgreSQL database (DATABASE_URL must point to localhost).
 * The OCR provider (PlateRecognitionService) is mocked; everything else is real.
 */

const requireLocalDb = () => {
  const url = process.env.DATABASE_URL ?? '';
  if (!/localhost|127\.0\.0\.1/.test(url)) {
    throw new Error(
      `Integration tests require a LOCAL database. DATABASE_URL=${url} — refusing to run against a remote (production) database.`,
    );
  }
};

describe('OCR -> API -> Database integration (plate normalization)', () => {
  let prisma: PrismaService;
  let service: OcrService;
  let plateRecognition: { recognize: jest.Mock };
  const createdIds: string[] = [];

  beforeAll(async () => {
    requireLocalDb();
    plateRecognition = { recognize: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        PrismaService,
        OcrService,
        { provide: PlateRecognitionService, useValue: plateRecognition },
        {
          provide: OcrEvidenceStorageService,
          useValue: {
            saveImage: jest.fn().mockResolvedValue({
              imageKey: null,
              thumbnailKey: null,
              imageMimeType: null,
              imageSizeBytes: null,
              imageSha256: null,
            }),
            deleteEvidenceFiles: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: unknown) => {
              if (key === 'PLATE_RECOGNIZER_CAMERA_ID') return 'cam-verify';
              if (key === 'OCR_FULL_IMAGE_RETENTION_DAYS') return 30;
              if (key === 'OCR_THUMBNAIL_RETENTION_DAYS') return 90;
              return defaultValue ?? undefined;
            }),
          },
        },
      ],
    }).compile();

    prisma = module.get(PrismaService);
    service = module.get(OcrService);

    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (err) {
      throw new Error(
        `Cannot connect to local database for integration tests: ${(err as Error).message}`,
      );
    }
  });

  afterAll(async () => {
    if (createdIds.length > 0) {
      await (prisma as any).ocrEvidence.deleteMany({
        where: { id: { in: createdIds } },
      });
    }
    await prisma.$disconnect();
  });

  const upload = {
    buffer: Buffer.from('fake-image-bytes'),
    mimetype: 'image/jpeg',
    originalname: 'verify.jpg',
    size: 17,
  };

  const mockScan = (overrides: Record<string, unknown>) => ({
    plate: '30a12345',
    rawPlate: '30a12345',
    canonicalPlate: '30A12345',
    displayPlate: '30A-123.45',
    score: 0.99,
    vehicleType: 'car',
    providerFilename: 'verify.jpg',
    providerTimestamp: new Date().toISOString(),
    rawResponse: { results: [{ plate: '30a12345' }] },
    plateBox: null,
    ...overrides,
  });

  it('AC A: OCR "30a12345" persists raw/canonical/display in ocr_evidences', async () => {
    plateRecognition.recognize.mockResolvedValue(mockScan({}));

    const res = await service.recognize(upload, {}, null as unknown as string);

    expect(res).toMatchObject({
      rawPlate: '30a12345',
      canonicalPlate: '30A12345',
      displayPlate: '30A-123.45',
      detectedPlate: '30a12345',
      provider: 'PLATE_RECOGNIZER',
    });

    const row = await (prisma as any).ocrEvidence.findUnique({
      where: { id: res.ocrEvidenceId },
    });
    expect(row).toMatchObject({
      ocrPlate: '30a12345',
      rawPlate: '30a12345',
      canonicalPlate: '30A12345',
      displayPlate: '30A-123.45',
      errorMessage: null,
    });
    createdIds.push(res.ocrEvidenceId);
  });

  it('AC B: OCR "30A-123.45" persists canonical "30A12345"', async () => {
    plateRecognition.recognize.mockResolvedValue(
      mockScan({
        plate: '30A-123.45',
        rawPlate: '30A-123.45',
        canonicalPlate: '30A12345',
        displayPlate: '30A-123.45',
      }),
    );

    const res = await service.recognize(upload, {}, null as unknown as string);

    expect(res.canonicalPlate).toBe('30A12345');
    expect(res.displayPlate).toBe('30A-123.45');

    const row = await (prisma as any).ocrEvidence.findUnique({
      where: { id: res.ocrEvidenceId },
    });
    expect(row.canonicalPlate).toBe('30A12345');
    expect(row.displayPlate).toBe('30A-123.45');
    expect(row.rawPlate).toBe('30A-123.45');
    createdIds.push(res.ocrEvidenceId);
  });

  it('persists a null-field evidence row when the OCR provider fails', async () => {
    plateRecognition.recognize.mockRejectedValue(new Error('provider unavailable'));

    const res = await service.recognize(upload, {}, null as unknown as string);

    expect(res).toMatchObject({
      detectedPlate: null,
      rawPlate: null,
      canonicalPlate: null,
      displayPlate: null,
      error: 'provider unavailable',
    });

    const row = await (prisma as any).ocrEvidence.findUnique({
      where: { id: res.ocrEvidenceId },
    });
    expect(row).toMatchObject({
      errorMessage: 'provider unavailable',
      rawPlate: null,
      canonicalPlate: null,
      displayPlate: null,
    });
    createdIds.push(res.ocrEvidenceId);
  });
});
