export interface UploadedOcrImage {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname: string;
}

export interface OcrRecognizeInput {
  cameraId?: string;
  buildingName?: string;
  gateName?: string;
  reservationId?: string;
}

export interface PlateBox {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
}

export interface OcrRecognizeResponse {
  ocrEvidenceId: string;
  detectedPlate: string | null;
  confidence: number | null;
  vehicleTypePrediction: string | null;
  provider: 'PLATE_RECOGNIZER';
  providerFilename: string | null;
  providerTimestamp: string | null;
  cameraId: string | null;
  plateBox: PlateBox | null;
  buildingName: string;
  gateName: string;
  error: string | null;
  durationMs: number;
}
