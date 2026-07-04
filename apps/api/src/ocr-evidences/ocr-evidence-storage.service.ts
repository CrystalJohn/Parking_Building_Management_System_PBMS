import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

type SharpPipeline = {
  resize: (...args: unknown[]) => SharpPipeline;
  jpeg: (...args: unknown[]) => SharpPipeline;
  toBuffer: () => Promise<Buffer>;
};

const sharp = require('sharp') as (input: Buffer) => SharpPipeline;

@Injectable()
export class OcrEvidenceStorageService implements OnModuleInit {
  private readonly logger = new Logger(OcrEvidenceStorageService.name);
  private readonly storageRoot: string;
  private readonly quality: number;
  private readonly thumbnailQuality: number;
  private readonly maxWidth: number;
  private readonly thumbnailWidth: number;
  private readonly thumbnailHeight: number;

  constructor(private readonly config: ConfigService) {
    this.storageRoot = this.config.get<string>('OCR_EVIDENCE_STORAGE_ROOT', 'uploads/ocr-evidence');
    this.quality = this.config.get<number>('OCR_EVIDENCE_IMAGE_QUALITY', 78);
    this.thumbnailQuality = this.config.get<number>('OCR_EVIDENCE_THUMBNAIL_QUALITY', 60);
    this.maxWidth = this.config.get<number>('OCR_EVIDENCE_MAX_WIDTH', 1280);
    this.thumbnailWidth = this.config.get<number>('OCR_EVIDENCE_THUMBNAIL_WIDTH', 360);
    this.thumbnailHeight = 240;
  }

  async onModuleInit() {
    await this.ensureBaseDir();
  }

  private getBaseDir(): string {
    return path.resolve(this.storageRoot);
  }

  private dateDir(date: Date = new Date()): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}/${m}/${d}`;
  }

  private async ensureDir(dir: string) {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch {
      // ignore if already exists
    }
  }

  private async ensureBaseDir() {
    await this.ensureDir(this.getBaseDir());
  }

  async saveImage(
    evidenceId: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<{
    imageKey: string;
    thumbnailKey: string;
    imageMimeType: string;
    imageSizeBytes: number;
    imageSha256: string;
  }> {
    const dateDir = this.dateDir();
    const fullDir = path.join(this.getBaseDir(), dateDir);
    await this.ensureDir(fullDir);

    const imageKey = `${dateDir}/${evidenceId}.jpg`;
    const thumbnailKey = `${dateDir}/${evidenceId}-thumb.jpg`;

    // compress and save full image
    const compressed = await sharp(buffer)
      .resize(this.maxWidth, undefined, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: this.quality, mozjpeg: true })
      .toBuffer();

    await fs.writeFile(path.join(this.getBaseDir(), imageKey), compressed);

    // generate thumbnail
    const thumbnail = await sharp(compressed)
      .resize(this.thumbnailWidth, this.thumbnailHeight, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: this.thumbnailQuality, mozjpeg: true })
      .toBuffer();

    await fs.writeFile(path.join(this.getBaseDir(), thumbnailKey), thumbnail);

    const imageSha256 = crypto.createHash('sha256').update(compressed).digest('hex');

    return {
      imageKey,
      thumbnailKey,
      imageMimeType: 'image/jpeg',
      imageSizeBytes: compressed.length,
      imageSha256,
    };
  }

  getImageAbsolutePath(imageKey: string): string {
    return path.join(this.getBaseDir(), imageKey);
  }

  getThumbnailAbsolutePath(thumbnailKey: string): string {
    return path.join(this.getBaseDir(), thumbnailKey);
  }

  async deleteImage(imageKey: string): Promise<void> {
    try {
      await fs.unlink(this.getImageAbsolutePath(imageKey));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn(`Failed to delete image: ${imageKey}`, (err as Error).message);
      }
    }
  }

  async deleteThumbnail(thumbnailKey: string): Promise<void> {
    try {
      await fs.unlink(this.getThumbnailAbsolutePath(thumbnailKey));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn(`Failed to delete thumbnail: ${thumbnailKey}`, (err as Error).message);
      }
    }
  }

  async deleteEvidenceFiles(imageKey: string | null, thumbnailKey: string | null): Promise<void> {
    if (imageKey) await this.deleteImage(imageKey);
    if (thumbnailKey) await this.deleteThumbnail(thumbnailKey);
  }
}
