import { Module } from '@nestjs/common';
import { PlateRecognitionModule } from '../plate-recognition/plate-recognition.module';
import { OcrController, OcrEvidencesController } from './ocr.controller';
import { OcrService } from './ocr.service';

@Module({
  imports: [PlateRecognitionModule],
  controllers: [OcrController, OcrEvidencesController],
  providers: [OcrService],
  exports: [OcrService],
})
export class OcrModule {}
