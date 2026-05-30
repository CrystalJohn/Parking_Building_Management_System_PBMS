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
  /** Formatted plate for display/storage, e.g. "12B1-16888". Null if nothing found. */
  plate: string | null;
  /** Raw plate text as returned by the engine, e.g. "12b116888". */
  rawPlate: string | null;
  /** OCR confidence of the top result (0..1). */
  score: number;
  /** Detection confidence of the top result (0..1). */
  dscore: number;
  /** Detected plate region code, e.g. "vn". */
  region: string | null;
  /** Alternative readings, best first. */
  candidates: PlateScanCandidate[];
  /** Vehicle type when available (Sedan, Motorcycle, ...). */
  vehicleType: string | null;
  /** Engine processing time in ms. */
  processingTime: number;
}

/**
 * Format a raw Vietnamese plate string (e.g. "12b116888") into the canonical
 * display form "12B1-16888".
 *
 * VN plate structure: [2-digit province][series][5-digit number]
 * The number part is ALWAYS exactly 5 digits (000.01–999.99, dot stripped).
 * Series = 1–2 letters optionally followed by 1 digit (e.g. A, B1, AB, AB1).
 * Falls back to the uppercased raw text when the pattern doesn't match.
 */
export function formatVietnamesePlate(raw: string): string {
  const clean = (raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const m = clean.match(/^(\d{2})([A-Z]{1,2}\d?)(\d{5})$/);
  if (m) return `${m[1]}${m[2]}-${m[3]}`;
  return clean;
}

@Injectable()
export class PlateRecognitionService {
  private readonly logger = new Logger(PlateRecognitionService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * Forward an image to Plate Recognizer Snapshot Cloud and return the best
   * license plate reading. The API token stays on the server.
   */
  async recognize(buffer: Buffer, mimeType: string): Promise<PlateScanResult> {
    const token = this.config.get<string>('PLATE_RECOGNIZER_TOKEN');
    if (!token) {
      this.logger.error('PLATE_RECOGNIZER_TOKEN is not configured');
      throw new ServiceUnavailableException(
        'Chưa cấu hình PLATE_RECOGNIZER_TOKEN trên máy chủ',
      );
    }

    const form = new FormData();
    form.append(
      'upload',
      new Blob([new Uint8Array(buffer)], { type: mimeType || 'image/jpeg' }),
      'plate.jpg',
    );
    // Tune the engine for Vietnamese plates — this is what disambiguates
    // 0/O, 1/I, etc. and is the main accuracy win over generic OCR.
    form.append('regions', 'vn');
    form.append('config', JSON.stringify({ mode: 'fast' }));

    let res: Response;
    try {
      res = await fetch(PLATE_READER_URL, {
        method: 'POST',
        headers: { Authorization: `Token ${token}` },
        body: form,
      });
    } catch (err) {
      this.logger.error(`Plate Recognizer request failed: ${String(err)}`);
      throw new ServiceUnavailableException(
        'Không kết nối được dịch vụ nhận diện biển số',
      );
    }

    if (res.status === 429) {
      throw new HttpException(
        'Quá nhiều yêu cầu nhận diện, thử lại sau giây lát',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (res.status === 403) {
      this.logger.error('Plate Recognizer 403 — token sai hoặc hết credit');
      throw new ServiceUnavailableException(
        'Dịch vụ nhận diện biển số từ chối yêu cầu (kiểm tra token hoặc credit)',
      );
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.logger.error(`Plate Recognizer error ${res.status}: ${text}`);
      throw new ServiceUnavailableException('Lỗi dịch vụ nhận diện biển số');
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
      };
    }

    // Pick the result with the highest OCR score.
    const top = results.reduce((best, cur) =>
      (cur?.score ?? 0) > (best?.score ?? 0) ? cur : best,
    );

    const rawPlate: string | null = top?.plate ?? null;
    const candidates: PlateScanCandidate[] = Array.isArray(top?.candidates)
      ? top.candidates.map((c: any) => ({
          plate: formatVietnamesePlate(c?.plate ?? ''),
          score: c?.score ?? 0,
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
    };
  }
}
