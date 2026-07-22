import { BadRequestException, Injectable } from '@nestjs/common';
import { SessionStatus } from '@prisma/client';
import { UploadedOcrImage } from '../ocr/ocr.types';
import { OcrService } from '../ocr';
import { SessionsService } from '../sessions/sessions.service';
import { VehiclesService, normalizePlateNumber } from '../vehicles/vehicles.service';
import { GateLanesService } from '../gate-lanes/gate-lanes.service';
import { ResolvePlateDto, ScanPlateDto } from './dto';

type GateSource = 'OCR' | 'MANUAL';
type GateCheckoutSubMode = 'PAYMENT_REQUIRED' | 'PAYMENT_PENDING' | 'READY_TO_EXIT';

export type GateScanResponse =
  | {
      mode: 'CHECK_IN';
      source: GateSource;
      plateOcr?: string | null;
      plateConfirmed: string;
      confidence?: number | null;
      ocrEvidenceId?: string;
      lookup: Awaited<ReturnType<VehiclesService['lookupPlate']>>;
    }
  | {
      mode: 'CHECK_OUT';
      source: GateSource;
      plateOcr?: string | null;
      plateConfirmed: string;
      confidence?: number | null;
      ocrEvidenceId?: string;
      subMode: GateCheckoutSubMode;
      checkout: NonNullable<Awaited<ReturnType<SessionsService['lookupOpenForGateByPlate']>>>;
    }
  | {
      mode: 'NEEDS_MANUAL_PLATE';
      source: 'OCR';
      ocrEvidenceId?: string;
      error?: string | null;
    };

@Injectable()
export class GateService {
  constructor(
    private readonly ocrService: OcrService,
    private readonly sessionsService: SessionsService,
    private readonly vehiclesService: VehiclesService,
    private readonly gateLanesService: GateLanesService,
  ) {}

  async scanPlate(
    file: UploadedOcrImage,
    input: ScanPlateDto,
    staffId: string,
  ): Promise<GateScanResponse> {
    await this.gateLanesService.requireActiveLane(staffId);
    const ocr = await this.ocrService.recognize(file, input, staffId);

    if (!ocr.detectedPlate) {
      return {
        mode: 'NEEDS_MANUAL_PLATE',
        source: 'OCR',
        ocrEvidenceId: ocr.ocrEvidenceId,
        error: ocr.error ?? 'No plate detected',
      };
    }

    return this.resolvePlateMode({
      plate: ocr.detectedPlate,
      source: 'OCR',
      ocrEvidenceId: ocr.ocrEvidenceId,
      staffId,
      plateOcr: ocr.detectedPlate,
      confidence: ocr.confidence,
    });
  }

  async resolvePlate(input: ResolvePlateDto, staffId: string): Promise<Exclude<GateScanResponse, { mode: 'NEEDS_MANUAL_PLATE' }>> {
    await this.gateLanesService.requireActiveLane(staffId);
    return this.resolvePlateMode({
      plate: input.plate,
      source: 'MANUAL',
      ocrEvidenceId: input.ocrEvidenceId,
      staffId,
    });
  }

  private async resolvePlateMode(input: {
    plate: string;
    source: GateSource;
    ocrEvidenceId?: string;
    plateOcr?: string | null;
    confidence?: number | null;
    staffId: string;
  }): Promise<Exclude<GateScanResponse, { mode: 'NEEDS_MANUAL_PLATE' }>> {
    const lane = await this.gateLanesService.requireActiveLane(input.staffId);
    const plateConfirmed = normalizePlateNumber(input.plate);
    if (!plateConfirmed) {
      throw new BadRequestException('plate is required');
    }

    const checkout = await this.sessionsService.lookupOpenForGateByPlate(plateConfirmed);
    if (checkout) {
      this.gateLanesService.assertVehicleType(lane, checkout.session.vehicleType);
      if (input.ocrEvidenceId) {
        await this.ocrService.linkEvidenceToCheckout(
          input.ocrEvidenceId,
          checkout.session.id,
          plateConfirmed,
        );
      }
      return {
        mode: 'CHECK_OUT',
        source: input.source,
        plateOcr: input.plateOcr ?? null,
        plateConfirmed,
        confidence: input.confidence ?? null,
        ocrEvidenceId: input.ocrEvidenceId,
        subMode: this.mapCheckoutSubMode(checkout.session.status),
        checkout,
      };
    }

    const lookup = await this.vehiclesService.lookupPlate(plateConfirmed);
    if (lookup.matched && lookup.vehicleType) {
      this.gateLanesService.assertVehicleType(lane, lookup.vehicleType as any);
    }
    return {
      mode: 'CHECK_IN',
      source: input.source,
      plateOcr: input.plateOcr ?? null,
      plateConfirmed,
      confidence: input.confidence ?? null,
      ocrEvidenceId: input.ocrEvidenceId,
      lookup,
    };
  }

  private mapCheckoutSubMode(status: SessionStatus): GateCheckoutSubMode {
    switch (status) {
      case SessionStatus.active:
        return 'PAYMENT_REQUIRED';
      case SessionStatus.checkout_pending:
        return 'PAYMENT_PENDING';
      case SessionStatus.exit_authorized:
        return 'READY_TO_EXIT';
      default:
        throw new BadRequestException(`Unsupported open-session status: ${status}`);
    }
  }
}
