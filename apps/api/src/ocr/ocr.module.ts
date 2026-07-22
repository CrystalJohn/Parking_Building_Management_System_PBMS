import { Module } from '@nestjs/common';
import { PlateRecognitionModule } from '../plate-recognition/plate-recognition.module';
import { OcrEvidencesModule } from '../ocr-evidences/ocr-evidences.module';
import { OcrController } from './ocr.controller';
import { OcrService } from './ocr.service';
import { GateLanesModule } from '../gate-lanes/gate-lanes.module';

@Module({
  imports: [PlateRecognitionModule, OcrEvidencesModule, GateLanesModule],
  controllers: [OcrController],
  providers: [OcrService],
  exports: [OcrService],
})
export class OcrModule {}
