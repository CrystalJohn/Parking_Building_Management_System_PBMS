import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { OcrEvidenceStorageService } from './ocr-evidence-storage.service';

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

describe('OcrEvidenceStorageService', () => {
  let storageRoot: string;
  let service: OcrEvidenceStorageService;

  beforeEach(async () => {
    storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pbms-ocr-evidence-'));

    const config = {
      get: jest.fn((key: string, defaultValue?: unknown) => {
        if (key === 'OCR_EVIDENCE_STORAGE_ROOT') return storageRoot;
        return defaultValue;
      }),
    } as unknown as ConfigService;

    service = new OcrEvidenceStorageService(config);
    await service.onModuleInit();
  });

  afterEach(async () => {
    await fs.rm(storageRoot, { recursive: true, force: true });
  });

  it('persists a compressed full image and thumbnail for OCR evidence', async () => {
    const result = await service.saveImage('evidence-1', ONE_PIXEL_PNG, 'image/png');

    expect(result).toMatchObject({
      imageKey: expect.stringMatching(/evidence-1\.jpg$/),
      thumbnailKey: expect.stringMatching(/evidence-1-thumb\.jpg$/),
      imageMimeType: 'image/jpeg',
      imageSha256: expect.any(String),
    });
    expect(result.imageSizeBytes).toBeGreaterThan(0);

    const fullImage = await fs.stat(service.getImageAbsolutePath(result.imageKey));
    const thumbnail = await fs.stat(service.getThumbnailAbsolutePath(result.thumbnailKey));

    expect(fullImage.size).toBeGreaterThan(0);
    expect(thumbnail.size).toBeGreaterThan(0);
  });
});
