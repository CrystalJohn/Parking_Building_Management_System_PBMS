import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { OcrEvidenceStorageService } from './ocr-evidence-storage.service';

@Injectable()
export class OcrEvidenceRetentionService {
  private readonly logger = new Logger(OcrEvidenceRetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: OcrEvidenceStorageService,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupExpiredImages() {
    this.logger.log('Starting OCR evidence image cleanup...');
    const now = new Date();

    const fullDeleted = await this.cleanupExpiredFullImages(now);
    const thumbDeleted = await this.cleanupExpiredThumbnails(now);
    const orphanDeleted = await this.cleanupOrphanFiles();

    this.logger.log(
      `OCR evidence cleanup done: full=${fullDeleted}, thumbnail=${thumbDeleted}, orphan=${orphanDeleted}`,
    );
  }

  private async cleanupExpiredFullImages(now: Date): Promise<number> {
    const expiredRecords = await this.prisma.ocrEvidence.findMany({
      where: {
        imageExpiresAt: { lte: now },
        imageDeletedAt: null,
        imageKey: { not: null },
      },
      select: { id: true, imageKey: true },
    });

    for (const record of expiredRecords) {
      await this.storage.deleteImage(record.imageKey!);
      await this.prisma.ocrEvidence.update({
        where: { id: record.id },
        data: {
          imageDeletedAt: now,
          imageKey: null,
        },
      });
    }

    return expiredRecords.length;
  }

  private async cleanupExpiredThumbnails(now: Date): Promise<number> {
    const expiredRecords = await this.prisma.ocrEvidence.findMany({
      where: {
        thumbnailExpiresAt: { lte: now },
        thumbnailDeletedAt: null,
        thumbnailKey: { not: null },
      },
      select: { id: true, thumbnailKey: true },
    });

    for (const record of expiredRecords) {
      await this.storage.deleteThumbnail(record.thumbnailKey!);
      await this.prisma.ocrEvidence.update({
        where: { id: record.id },
        data: {
          thumbnailDeletedAt: now,
          thumbnailKey: null,
        },
      });
    }

    return expiredRecords.length;
  }

  private async cleanupOrphanFiles(): Promise<number> {
    const storageRoot = this.config.get<string>('OCR_EVIDENCE_STORAGE_ROOT', 'uploads/ocr-evidence');
    const fullPath = path.resolve(storageRoot);

    let allDbKeys = new Set<string>();

    try {
      const records = await this.prisma.ocrEvidence.findMany({
        where: {
          OR: [
            { imageKey: { not: null } },
            { thumbnailKey: { not: null } },
          ],
        },
        select: { imageKey: true, thumbnailKey: true },
      });

      for (const r of records) {
        if (r.imageKey) allDbKeys.add(r.imageKey.replace(/\\/g, '/'));
        if (r.thumbnailKey) allDbKeys.add(r.thumbnailKey.replace(/\\/g, '/'));
      }
    } catch {
      return 0;
    }

    let orphanCount = 0;
    try {
      const files = await this.walkDir(fullPath);
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;

      for (const filePath of files) {
        try {
          const stat = await fs.stat(filePath);
          if (stat.mtimeMs > cutoff) continue;

          const relativeKey = path.relative(fullPath, filePath).replace(/\\/g, '/');
          if (!allDbKeys.has(relativeKey)) {
            await fs.unlink(filePath);
            orphanCount++;
            this.logger.debug(`Deleted orphan file: ${relativeKey}`);
          }
        } catch {
          // skip if can't stat/unlink
        }
      }
    } catch {
      // storage dir may not exist
    }

    return orphanCount;
  }

  private async walkDir(dir: string): Promise<string[]> {
    const files: string[] = [];
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          files.push(...(await this.walkDir(full)));
        } else if (entry.isFile()) {
          files.push(full);
        }
      }
    } catch {
      // dir may not exist
    }
    return files;
  }
}
