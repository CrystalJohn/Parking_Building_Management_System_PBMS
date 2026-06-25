import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const PLATE_READER_URL = 'https://api.platerecognizer.com/v1/plate-reader/';

export interface PlateScanCandidate {
  plate: string;
  score: number;
}

export interface PlateScanResult {
  plate: string | null;
  rawPlate: string | null;
  score: number;
  dscore: number;
  region: string | null;
  candidates: PlateScanCandidate[];
  vehicleType: string | null;
  processingTime: number;
  providerFilename?: string | null;
  providerTimestamp?: string | null;
  plateBox?: { xmin: number; ymin: number; xmax: number; ymax: number } | null;
  rawResponse?: unknown;
}

export function formatVietnamesePlate(raw: string): string {
  const clean = (raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  const motorbike = clean.match(/^(\d{2})([A-Z]\d)(\d{3})(\d{2})$/);
  if (motorbike) {
    return `${motorbike[1]}${motorbike[2]}-${motorbike[3]}.${motorbike[4]}`;
  }

  const motorbikeWithExtraProvinceDigit = clean.match(
    /^(\d{2})\d([A-Z]\d)(\d{3})(\d{2})$/,
  );
  if (motorbikeWithExtraProvinceDigit) {
    return `${motorbikeWithExtraProvinceDigit[1]}${motorbikeWithExtraProvinceDigit[2]}-${motorbikeWithExtraProvinceDigit[3]}.${motorbikeWithExtraProvinceDigit[4]}`;
  }

  const match = clean.match(/^(\d{2})([A-Z]{1,2}\d?)(\d{5})$/);
  if (match) return `${match[1]}${match[2]}-${match[3]}`;

  const oldCar = clean.match(/^(\d{2})([A-Z]{1,2}\d?)(\d{4})$/);
  if (oldCar) return `${oldCar[1]}${oldCar[2]}-${oldCar[3]}`;

  return clean;
}

@Injectable()
export class PlateRecognitionService {
  private readonly logger = new Logger(PlateRecognitionService.name);

  constructor(private readonly config: ConfigService) {}

  async recognize(buffer: Buffer, mimeType: string): Promise<PlateScanResult> {
    const token =
      this.config.get<string>('PLATE_RECOGNIZER_API_TOKEN') ??
      this.config.get<string>('PLATE_RECOGNIZER_TOKEN');
    const apiUrl =
      this.config.get<string>('PLATE_RECOGNIZER_API_URL') ?? PLATE_READER_URL;

    if (!token) {
      this.logger.error('PLATE_RECOGNIZER_API_TOKEN is not configured');
      throw new ServiceUnavailableException(
        'PLATE_RECOGNIZER_API_TOKEN is not configured',
      );
    }

    const form = new FormData();
    form.append(
      'upload',
      new Blob([new Uint8Array(buffer)], { type: mimeType || 'image/jpeg' }),
      'plate.jpg',
    );
    form.append('regions', 'vn');
    form.append('config', JSON.stringify({ mode: 'fast' }));

    let res: Response;
    try {
      res = await fetch(apiUrl, {
        method: 'POST',
        headers: { Authorization: `Token ${token}` },
        body: form,
      });
    } catch (err) {
      this.logger.error(`Plate Recognizer request failed: ${String(err)}`);
      throw new ServiceUnavailableException(
        'Cannot connect to license plate recognition service',
      );
    }

    if (res.status === 429) {
      throw new HttpException(
        'Too many plate recognition requests, try again later',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (res.status === 403) {
      this.logger.error('Plate Recognizer 403 - invalid token or no credit');
      throw new ServiceUnavailableException(
        'Plate recognition service rejected the request',
      );
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.logger.error(`Plate Recognizer error ${res.status}: ${text}`);
      throw new ServiceUnavailableException('Plate recognition service error');
    }

    const data: any = await res.json();
    const results: any[] = Array.isArray(data?.results) ? data.results : [];

    if (results.length === 0) {
      return {
        plate: null,
        rawPlate: null,
        score: 0,
        dscore: 0,
        region: null,
        candidates: [],
        vehicleType: null,
        processingTime: data?.processing_time ?? 0,
        providerFilename: data?.filename ?? null,
        providerTimestamp: data?.timestamp ?? null,
        plateBox: null,
        rawResponse: data,
      };
    }

    const top = results.reduce((best, cur) =>
      (cur?.score ?? 0) > (best?.score ?? 0) ? cur : best,
    );

    const rawPlate: string | null = top?.plate ?? null;
    const candidates: PlateScanCandidate[] = Array.isArray(top?.candidates)
      ? top.candidates.map((candidate: any) => ({
          plate: formatVietnamesePlate(candidate?.plate ?? ''),
          score: candidate?.score ?? 0,
        }))
      : [];

    return {
      plate: rawPlate ? formatVietnamesePlate(rawPlate) : null,
      rawPlate,
      score: top?.score ?? 0,
      dscore: top?.dscore ?? 0,
      region: top?.region?.code ?? null,
      candidates,
      vehicleType: top?.vehicle?.type ?? null,
      processingTime: data?.processing_time ?? 0,
      providerFilename: data?.filename ?? null,
      providerTimestamp: data?.timestamp ?? null,
      plateBox: top?.box
        ? {
            xmin: top.box.xmin,
            ymin: top.box.ymin,
            xmax: top.box.xmax,
            ymax: top.box.ymax,
          }
        : null,
      rawResponse: data,
    };
  }
}
