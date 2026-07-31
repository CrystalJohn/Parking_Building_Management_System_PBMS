import { BadRequestException, Injectable } from '@nestjs/common';
import { SessionStatus } from '@prisma/client';
import { UploadedOcrImage } from '../ocr/ocr.types';
import { OcrService } from '../ocr';
import { SessionsService } from '../sessions/sessions.service';
import { VehiclesService, normalizePlateNumber } from '../vehicles/vehicles.service';
import { GateLanesService } from '../gate-lanes/gate-lanes.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReservationsService } from '../reservations/reservations.service';
import { toDisplay } from '../plates';
import { ResolvePlateDto, ScanPlateDto } from './dto';

type GateSource = 'OCR' | 'MANUAL';
type GateCheckoutSubMode = 'PAYMENT_REQUIRED' | 'PAYMENT_PENDING' | 'READY_TO_EXIT';

export type GateVerifyResponse =
  | {
    plate: string;
    canonicalPlate: string;
    vehicleStatus: 'ACTIVE_SESSION';
    recommendedAction: 'CHECKOUT';
    confidence: number | null;
    sessionId: string;
    subMode: GateCheckoutSubMode;
  }
  | {
    plate: string;
    canonicalPlate: string;
    vehicleStatus: 'ACTIVE_RESERVATION';
    recommendedAction: 'CHECKIN';
    confidence: number | null;
    reservationId: string;
  }
  | {
    plate: string;
    canonicalPlate: string;
    vehicleStatus: 'UNKNOWN';
    recommendedAction: 'MANUAL_REVIEW';
    confidence: number | null;
  };

export type GateScanResponse =
  | {
    mode: 'CHECK_IN';
    source: GateSource;
    plateOcr?: string | null;
    plateConfirmed: string;
    plateDisplay: string | null;
    confidence?: number | null;
    ocrEvidenceId?: string;
    lookup: Awaited<ReturnType<VehiclesService['lookupPlate']>>;
  }
  | {
    mode: 'CHECK_OUT';
    source: GateSource;
    plateOcr?: string | null;
    plateConfirmed: string;
    plateDisplay: string | null;
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
    private readonly reservationsService: ReservationsService,
    private readonly prisma: PrismaService,
  ) { }

  async scanPlate(
    file: UploadedOcrImage,
    input: ScanPlateDto,
    staffId: string,
  ): Promise<GateScanResponse> {
    const [lane, ocr] = await Promise.all([
      this.gateLanesService.requireActiveLane(staffId),
      this.ocrService.recognize(file, input, staffId),
    ]);

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
      lane,
    });
  }

  async resolvePlate(input: ResolvePlateDto, staffId: string): Promise<Exclude<GateScanResponse, { mode: 'NEEDS_MANUAL_PLATE' }>> {
    const lane = await this.gateLanesService.requireActiveLane(staffId);
    return this.resolvePlateMode({
      plate: input.plate,
      source: 'MANUAL',
      ocrEvidenceId: input.ocrEvidenceId,
      staffId,
      lane,
    });
  }

  async verifyPlate(input: {
    canonicalPlate: string;
    ocrEvidenceId?: string;
    staffId?: string;
  }): Promise<GateVerifyResponse> {
    const canonicalPlate = normalizePlateNumber(input.canonicalPlate);
    const plate = toDisplay(canonicalPlate) ?? canonicalPlate;
    const confidence = await this.loadOcrConfidence(input.ocrEvidenceId);

    // STEP 1: active session wins (checkout)
    const checkout = await this.sessionsService.lookupOpenForGateByPlate(canonicalPlate);
    if (checkout) {
      return {
        plate,
        canonicalPlate,
        vehicleStatus: 'ACTIVE_SESSION',
        recommendedAction: 'CHECKOUT',
        confidence,
        sessionId: checkout.session.id,
        subMode: this.mapCheckoutSubMode(checkout.session.status),
      };
    }

    // STEP 2: active reservation (check-in)
    const reservation = await this.reservationsService.findActiveByCanonicalPlate(canonicalPlate);
    if (reservation) {
      return {
        plate,
        canonicalPlate,
        vehicleStatus: 'ACTIVE_RESERVATION',
        recommendedAction: 'CHECKIN',
        confidence,
        reservationId: reservation.id,
      };
    }

    // STEP 3: unknown vehicle -> manual review
    return {
      plate,
      canonicalPlate,
      vehicleStatus: 'UNKNOWN',
      recommendedAction: 'MANUAL_REVIEW',
      confidence,
    };
  }

  private async loadOcrConfidence(ocrEvidenceId?: string): Promise<number | null> {
    if (!ocrEvidenceId) {
      return null;
    }
    const evidence = await this.prisma.ocrEvidence.findUnique({
      where: { id: ocrEvidenceId },
      select: { ocrConfidence: true },
    });
    return evidence?.ocrConfidence ?? null;
  }

  private async resolvePlateMode(input: {
    plate: string;
    source: GateSource;
    ocrEvidenceId?: string;
    plateOcr?: string | null;
    confidence?: number | null;
    staffId: string;
    lane?: Awaited<ReturnType<InstanceType<typeof GateLanesService>['requireActiveLane']>>;
  }): Promise<Exclude<GateScanResponse, { mode: 'NEEDS_MANUAL_PLATE' }>> {
    const lane = input.lane ?? await this.gateLanesService.requireActiveLane(input.staffId);
    const plateConfirmed = normalizePlateNumber(input.plate);
    const plateDisplay = toDisplay(plateConfirmed);
    if (!plateConfirmed) {
      throw new BadRequestException('plate is required');
    }
    // kiểm tra luồng xe ra
    const checkout = await this.sessionsService.lookupOpenForGateByPlate(plateConfirmed);
    if (checkout) { // found vehicle checkout
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
        plateDisplay,
        confidence: input.confidence ?? null,
        ocrEvidenceId: input.ocrEvidenceId,
        subMode: this.mapCheckoutSubMode(checkout.session.status),
        checkout,
      };
    }
    // kiểm tra luồng xe vào
    const lookup = await this.vehiclesService.lookupPlate(plateConfirmed);
    if (lookup.matched && lookup.vehicleType) {
      this.gateLanesService.assertVehicleType(lane, lookup.vehicleType as any);
    }
    // response result về FE
    return {
      mode: 'CHECK_IN',
      source: input.source,
      plateOcr: input.plateOcr ?? null,
      plateConfirmed,
      plateDisplay,
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
