import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { SessionStatus } from '@prisma/client';
import { UploadedOcrImage } from '../ocr/ocr.types';
import { OcrService } from '../ocr';
import { SessionsService } from '../sessions/sessions.service';
import { VehiclesService, normalizePlateNumber } from '../vehicles/vehicles.service';
import { GateLanesService } from '../gate-lanes/gate-lanes.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReservationsService } from '../reservations/reservations.service';
import { PlateFormatter } from '../plates';
import { ResolvePlateDto, ScanPlateDto } from './dto';

type GateSource = 'OCR' | 'MANUAL';
type GateCheckoutSubMode = 'PAYMENT_REQUIRED' | 'PAYMENT_PENDING' | 'READY_TO_EXIT';

export type GateVerifyResponse =
  | {
    displayPlate: string;
    vehicleType: 'CAR' | 'MOTORBIKE' | 'UNKNOWN';
    vehicleTypeDetected?: string | null;
    canonicalPlate: string;
    vehicleStatus: 'ACTIVE_SESSION';
    recommendedAction: 'CHECKOUT';
    confidence: number | null;
    sessionId: string;
    subMode: GateCheckoutSubMode;
    ocrEvidenceId?: string;
  }
  | {
    displayPlate: string;
    vehicleType: 'CAR' | 'MOTORBIKE' | 'UNKNOWN';
    vehicleTypeDetected?: string | null;
    canonicalPlate: string;
    vehicleStatus: 'ACTIVE_RESERVATION';
    recommendedAction: 'CHECKIN';
    confidence: number | null;
    reservationId: string;
    ocrEvidenceId?: string;
  }
  | {
    displayPlate: string;
    vehicleType: 'CAR' | 'MOTORBIKE' | 'UNKNOWN';
    vehicleTypeDetected?: string | null;
    canonicalPlate: string;
    vehicleStatus: 'UNKNOWN';
    recommendedAction: 'MANUAL_REVIEW' | 'CHECKIN';
    confidence: number | null;
    ocrEvidenceId?: string;
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

  private recentGateEvents = new Map<string, number>();

  async scanPlate(
    file: UploadedOcrImage,
    input: ScanPlateDto,
    staffId: string,
  ): Promise<GateVerifyResponse> {
    const lane = await this.gateLanesService.requireActiveLane(staffId);
    const ocr = await this.ocrService.recognize(file, input, staffId);
    
    const canonicalPlate = ocr.detectedPlate ? normalizePlateNumber(ocr.detectedPlate) : '';
    
    if (canonicalPlate) {
      const key = `${canonicalPlate}_${lane.gateLane.id}`;
      const now = Date.now();
      const lastEvent = this.recentGateEvents.get(key);
      if (lastEvent && now - lastEvent < 30000) {
         throw new ConflictException('Duplicate scan within 30 seconds.');
      }
      this.recentGateEvents.set(key, now);
    }
    
    if (!canonicalPlate) {
      return {
        displayPlate: '',
        vehicleType: 'UNKNOWN',
        canonicalPlate: '',
        vehicleStatus: 'UNKNOWN',
        recommendedAction: 'MANUAL_REVIEW',
        confidence: ocr.confidence ?? 0,
        ocrEvidenceId: ocr.ocrEvidenceId,
      };
    }

    return this.verifyPlate({
      canonicalPlate,
      ocrEvidenceId: ocr.ocrEvidenceId,
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
  }): Promise<GateVerifyResponse> {
    console.log(`[GateService:verifyPlate] start: canonicalPlate=${input.canonicalPlate}`);
    const canonicalPlate = normalizePlateNumber(input.canonicalPlate);
    const displayPlate = PlateFormatter.toDisplay(canonicalPlate) ?? canonicalPlate;
    const kind = PlateFormatter.inferKind(canonicalPlate);
    const vehicleType = kind === 'car' ? 'CAR' : kind === 'motorbike' ? 'MOTORBIKE' : 'UNKNOWN';
    const ocrAttrs = await this.loadOcrEvidenceAttrs(input.ocrEvidenceId);
    const confidence = ocrAttrs.confidence;
    const vehicleTypeDetected = ocrAttrs.vehicleType;

    // STEP 1: active session wins (checkout)
    const checkout = await this.sessionsService.lookupOpenForGateByPlate(canonicalPlate);
    if (checkout) {
      console.log(`[GateService:verifyPlate] matched ACTIVE_SESSION (checkout), sessionId=${checkout.session.id}`);
      return {
        displayPlate,
        vehicleType,
        vehicleTypeDetected,
        canonicalPlate,
        vehicleStatus: 'ACTIVE_SESSION',
        recommendedAction: 'CHECKOUT',
        confidence,
        ocrEvidenceId: input.ocrEvidenceId,
        sessionId: checkout.session.id,
        subMode: this.mapCheckoutSubMode(checkout.session.status),
      };
    }

    // STEP 2: active reservation (check-in)
    const reservation = await this.reservationsService.findActiveByCanonicalPlate(canonicalPlate);
    if (reservation) {
      console.log(`[GateService:verifyPlate] matched ACTIVE_RESERVATION (checkin), reservationId=${reservation.id}`);
      return {
        displayPlate,
        vehicleType,
        vehicleTypeDetected,
        canonicalPlate,
        vehicleStatus: 'ACTIVE_RESERVATION',
        recommendedAction: 'CHECKIN',
        confidence,
        ocrEvidenceId: input.ocrEvidenceId,
        reservationId: reservation.id,
      };
    }

    // STEP 3: unknown vehicle -> check-in
    console.log(`[GateService:verifyPlate] matched UNKNOWN -> CHECKIN`);
    return {
      displayPlate,
      vehicleType,
      vehicleTypeDetected,
      canonicalPlate,
      vehicleStatus: 'UNKNOWN',
      recommendedAction: 'CHECKIN',
      confidence,
      ocrEvidenceId: input.ocrEvidenceId,
    };
  }

  async recordOverride(input: {
    canonicalPlate: string;
    plateDisplay: string;
    vehicleStatus: string;
    recommendedAction: string;
    actualAction: string;
    reason?: string;
    sessionId?: string;
    reservationId?: string;
    staffId: string;
  }) {
    console.log(`[GateService:recordAudit] plate=${input.canonicalPlate}, recommended=${input.recommendedAction}, actual=${input.actualAction}, reason=${input.reason}`);
    return this.prisma.gateAuditLog.create({
      data: {
        staffId: input.staffId,
        canonicalPlate: input.canonicalPlate,
        plateDisplay: input.plateDisplay,
        vehicleStatus: input.vehicleStatus,
        recommendedAction: input.recommendedAction,
        actualAction: input.actualAction,
        reason: input.reason,
        sessionId: input.sessionId,
        reservationId: input.reservationId,
      },
    });
  }

  private async loadOcrEvidenceAttrs(ocrEvidenceId?: string): Promise<{ confidence: number | null, vehicleType: string | null }> {
    if (!ocrEvidenceId) {
      return { confidence: null, vehicleType: null };
    }
    const evidence = await this.prisma.ocrEvidence.findUnique({
      where: { id: ocrEvidenceId },
      select: { ocrConfidence: true, vehicleType: true },
    });
    return {
      confidence: evidence?.ocrConfidence ?? null,
      vehicleType: evidence?.vehicleType ?? null,
    };
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
    const plateDisplay = PlateFormatter.toDisplay(plateConfirmed);
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
