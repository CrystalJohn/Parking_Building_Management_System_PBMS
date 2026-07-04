import { Module } from '@nestjs/common';
import { PlateRecognitionModule } from '../plate-recognition/plate-recognition.module';
import { OcrEvidencesModule } from '../ocr-evidences/ocr-evidences.module';
import { OcrController } from './ocr.controller';
import { OcrService } from './ocr.service';

@Module({
  imports: [PlateRecognitionModule, OcrEvidencesModule],
  controllers: [OcrController],
  providers: [OcrService],
  exports: [OcrService],
})
export class OcrModule {}
