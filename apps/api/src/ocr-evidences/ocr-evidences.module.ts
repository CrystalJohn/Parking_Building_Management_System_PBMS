import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OcrEvidencesController } from './ocr-evidences.controller';
import { OcrEvidencesService } from './ocr-evidences.service';
import { OcrEvidenceStorageService } from './ocr-evidence-storage.service';
import { OcrEvidenceRetentionService } from './ocr-evidence-retention.service';

@Module({
  imports: [PrismaModule],
  controllers: [OcrEvidencesController],
  providers: [
    OcrEvidencesService,
    OcrEvidenceStorageService,
    OcrEvidenceRetentionService,
  ],
  exports: [
    OcrEvidenceStorageService,
    OcrEvidenceRetentionService,
  ],
})
export class OcrEvidencesModule {}
