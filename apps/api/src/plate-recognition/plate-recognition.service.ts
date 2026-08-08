import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { normalize, toDisplay } from '../plates';

const PLATE_READER_URL = 'https://api.platerecognizer.com/v1/plate-reader/';

export interface PlateScanCandidate {
  plate: string;
  score: number;
}

export interface PlateScanResult {
  plate: string | null;
  rawPlate: string | null;
  canonicalPlate: string | null;
  displayPlate: string | null;
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
  const display = toDisplay(raw);
  if (display) return display;
  return (raw || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
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
      this.logger.warn(
        'PLATE_RECOGNIZER_API_TOKEN is not configured. Prompting manual plate entry.',
      );
      return {
        plate: null,
        rawPlate: null,
        canonicalPlate: null,
        displayPlate: null,
        score: 0,
        dscore: 0,
        region: 'vn',
        candidates: [],
        vehicleType: null,
        processingTime: 0.01,
        providerFilename: 'manual_required.jpg',
        providerTimestamp: new Date().toISOString(),
        plateBox: null,
        rawResponse: { tokenConfigured: false },
      };
    }

    const form = new FormData();
    form.append(
      'upload',
      new Blob([new Uint8Array(buffer)], { type: mimeType || 'image/jpeg' }),
      'plate.jpg',
    );
    form.append('regions', 'vn');
    form.append('config', JSON.stringify({ mode: 'fast' }));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    let res: Response;
    try {
      res = await fetch(apiUrl, {
        method: 'POST',
        headers: { Authorization: `Token ${token}` },
        body: form,
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        this.logger.error('Plate Recognizer request timed out after 10s');
        throw new ServiceUnavailableException(
          'Plate recognition service timed out, please try again',
        );
      }
      this.logger.error(`Plate Recognizer request failed: ${String(err)}`);
      throw new ServiceUnavailableException(
        'Cannot connect to license plate recognition service',
      );
    } finally {
      clearTimeout(timeoutId);
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
        canonicalPlate: null,
        displayPlate: null,
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

    const canonicalPlate = rawPlate ? normalize(rawPlate) : null;
    const displayPlate = canonicalPlate ? toDisplay(canonicalPlate) : null;

    return {
      plate: rawPlate ? formatVietnamesePlate(rawPlate) : null,
      rawPlate,
      canonicalPlate,
      displayPlate,
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
