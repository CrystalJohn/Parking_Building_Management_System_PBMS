import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  NotificationType,
  PaymentMethod,
  Prisma,
  SessionStatus,
  VehicleType,
  Zone,
} from '@prisma/client';
import * as QRCode from 'qrcode';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { AllocationService } from '../slots/allocation.service';
import { FeesService, FeeBreakdown } from '../fees/fees.service';
import { OcrService } from '../ocr';
import { OcrEvidenceStorageService } from '../ocr-evidences/ocr-evidence-storage.service';
import { VehicleIdentificationService } from '../vehicle-identification/vehicle-identification.service';
import { GateLanesService } from '../gate-lanes/gate-lanes.service';
import type { VehicleIdentityResult } from '../vehicle-identification/vehicle-identity.types';
import { normalizePlateNumber } from '../vehicles/vehicles.service';
import { PlateFormatter } from '../plates';
import {
  RESERVATION_CHECKIN_TOKEN_TYPE,
  type ReservationCheckInTokenPayload,
} from '../reservations/reservation-checkin-qr';
import { CheckInDto, CheckOutDto, ConfirmPaymentDto, LostTicketDto } from './dto';

interface CreateSessionInput {
  source: 'WALK_IN' | 'RESERVATION';
  slotId?: number | null;
  floorId?: number | null;
  zone?: Zone | null;
  vehicleType: VehicleType;
  plateConfirmed: string;
  plateDisplay?: string | null;
  plateOcr?: string | null;
  driverId?: string | null;
  vehicleId?: string | null;
  reservationId?: string | null;
  staffId: string;
  allocationStrategy: string;
  allocationTimeMs: number;
  identificationMethod?: string | null;
}

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly allocationService: AllocationService,
    private readonly feesService: FeesService,
    private readonly vehicleIdentificationService: VehicleIdentificationService,
    private readonly jwtService: JwtService,
    private readonly notificationsService: NotificationsService,
    private readonly ocrService: OcrService,
    private readonly ocrStorageService: OcrEvidenceStorageService,
    private readonly gateLanesService: GateLanesService,
  ) {}

  /**
   * Recent sessions for the gate history card.
   * type=checkin  → sessions ordered by check_in_time desc (all statuses)
   * type=checkout → sessions that have been checked out (completed/exit_authorized)
   */
  async findRecent(type?: 'checkin' | 'checkout', limit = 20, staffId?: string) {
    const lane = staffId ? await this.gateLanesService.requireActiveLane(staffId) : null;
    const where =
      type === 'checkout'
        ? { status: { in: ['completed', 'exit_authorized', 'checkout_pending'] as any } }
      : {};
    const laneWhere = lane ? { vehicleType: lane.gateLane.vehicleType } : {};

    const orderBy =
      type === 'checkout'
        ? [{ checkOutTime: 'desc' as const }, { checkInTime: 'desc' as const }]
        : [{ checkInTime: 'desc' as const }];

    const sessions = await this.prisma.parkingSession.findMany({
      where: { ...where, ...laneWhere },
      orderBy,
      take: Math.min(limit, 50),
      include: {
        slot: { include: { floor: true } },
        payment: { select: { method: true, status: true, amount: true } },
      },
    });

    return sessions.map((s) => ({
      id: s.id,
      sessionCode: s.sessionCode,
      licensePlate: s.licensePlate,
      plateDisplay: s.plateDisplay ?? null,
      vehicleType: s.vehicleType,
      status: s.status,
      checkInTime: s.checkInTime,
      checkOutTime: s.checkOutTime,
      slot: {
        code: s.slot.code,
        zone: s.slot.zone,
        floor: s.slot.floor.name,
        floorNumber: s.slot.floor.floorNumber,
      },
      payment: s.payment
        ? {
            method: (s.payment as any).method,
            status: (s.payment as any).status,
            amount: (s.payment as any).amount,
          }
        : null,
      feeAmount: s.feeAmount,
      penaltyAmount: s.penaltyAmount,
    }));
  }

  /**
   * 13.1–13.6 + Task 20 + P1-B: Check-in a vehicle.
   *
   * Flow:
   * 1. [P1-B] Delegate identification to VehicleIdentificationService
   *    → resolves licensePlate / reservationId from the identity result
   * 2. Validate no active session already exists for this plate
   * 3. Optionally resolve registered driver by phone (or from reservation)
   * 4. If identity has a reservationId → fulfill it (use reserved slot, skip allocation)
   * 5. Otherwise allocate a slot via AllocationService
   * 6. Inside a transaction: update slot → occupied, create ParkingSession
   * 7. If driver is registered, generate a QR code (UUID encoded)
   * 8. Return session + slot + optional QR code
   *
   * Req 1.1–1.5, 3.6, 8
   */
  async checkIn(dto: CheckInDto, staffId: string) {
    const lane = await this.gateLanesService.requireActiveLane(staffId);
    const laneVehicleType = lane.gateLane.vehicleType;
    // ─── P1-B: Identification (separated from business logic) ────────────
    const identity: VehicleIdentityResult =
      await this.vehicleIdentificationService.identifyForCheckIn({
        licensePlate: dto.licensePlate,
        reservationId: dto.reservationId ?? dto.reservationCode,
        driverPhone: dto.driverPhone,
        identificationConfidence: dto.identificationConfidence,
      });

    // Use the normalized plate from the identity result
    const licensePlate = identity.licensePlate ?? dto.licensePlate;
    const plateNumberConfirmed = normalizePlateNumber(licensePlate);
    const plateDisplay = PlateFormatter.toDisplay(plateNumberConfirmed);
    const plateNumberOcr =
      identity.source === 'OCR'
        ? normalizePlateNumber(identity.licensePlate)
        : null;

    // Resolve registered driver (optional — via phone or from reservation owner)
    let driverId: string | null = null;
    if (dto.driverPhone) {
      const driver = await this.prisma.user.findUnique({
        where: { phone: dto.driverPhone },
        select: { id: true, isActive: true },
      });
      if (driver?.isActive) {
        driverId = driver.id;
      }
    }

    const matchedVehicle = plateNumberConfirmed
      ? await this.prisma.vehicle.findFirst({
          where: {
            plateNumber: plateNumberConfirmed,
            isActive: true,
          },
          include: {
            vehicleUsers: {
              include: {
                user: {
                  select: {
                    id: true,
                    isActive: true,
                  },
                },
              },
              orderBy: [{ role: 'asc' as const }, { createdAt: 'asc' as const }],
            },
          },
        })
      : null;

    if (matchedVehicle) {
      this.gateLanesService.assertVehicleType(lane, matchedVehicle.vehicleType);
    }

    const vehicleOwner =
      matchedVehicle?.vehicleUsers.find((link) => link.role === 'owner' && link.user.isActive) ??
      matchedVehicle?.vehicleUsers.find((link) => link.user.isActive) ??
      null;

    if (!driverId && vehicleOwner) {
      driverId = vehicleOwner.user.id;
    }

    // ─── Reservation resolution (business logic) ──────────────────────────
    // The identity result already tells us if a reservation was confirmed.
    // Here we load the full reservation record needed for the transaction.
    let reservationId: string | null = null;
    let slot: { id: number; code: string; zone: any; floor: any; floorId: number; slotNumber: number; status: any; vehicleType: any };
    let allocationStrategy: string;
    let allocationTimeMs: number;

    let activeReservation: {
      id: string;
      driverId: string;
      slotId: number;
      vehicleType: any;
      status: string;
      expiresAt?: Date | null;
      slot: any;
    } | null = null;

    if (identity.reservationId) {
      // Identity confirmed a reservation — load the full record for the transaction.
      // IMPORTANT: identity.reservationId is authoritative. If the reservation is
      // invalid here, we must reject — NOT fall through to walk-in allocation.
      activeReservation = await this.prisma.reservation.findUnique({
        where: { id: identity.reservationId },
        include: { slot: { include: { floor: true } } },
      });

      this.assertReservationCanBeFulfilled(activeReservation, laneVehicleType);
      if (activeReservation) {
        this.gateLanesService.assertVehicleType(lane, activeReservation.vehicleType);
      }

      if (!driverId && activeReservation.driverId) {
        driverId = activeReservation.driverId;
      }
    }

    // Fallback: look up reservation via driverId if no direct reservation resolved
    if (!activeReservation && driverId) {
      activeReservation = await this.prisma.reservation.findFirst({
        where: {
          driverId,
            vehicleType: laneVehicleType,
          status: 'active',
        },
        include: { slot: { include: { floor: true } } },
      });

      if (activeReservation) {
        this.assertReservationCanBeFulfilled(activeReservation, laneVehicleType);
      }
    }

    if (activeReservation) {
      slot = activeReservation.slot;
      reservationId = activeReservation.id;
      allocationStrategy = 'reservation_fulfillment';
      allocationTimeMs = 0;
    } else {
      // 13.2: No slot assignment — building has no per-slot sensors.
      // Walk-in vehicles are tracked by lane/floor only, not a physical slot.
      slot = undefined;
      allocationStrategy = 'no_slot';
      allocationTimeMs = 0;
    }

    // ─── Transaction: slot update (reservations only) + session creation ───
    let session: any;
    try {
      session = await this.prisma.$transaction(async (tx) => {
        if (slot) {
          const expectedStatus = activeReservation ? 'reserved' : 'available';
          const lockedSlot = await tx.$queryRaw<{ id: number; status: string }[]>`
            SELECT id, status FROM slots
            WHERE id = ${slot.id} AND status = ${expectedStatus}::"SlotStatus"
            FOR UPDATE SKIP LOCKED
          `;

          if (!lockedSlot || lockedSlot.length === 0) {
            throw new ConflictException(
              `Slot ${slot.code} is no longer ${expectedStatus}. Please retry.`,
            );
          }

          await tx.slot.update({
            where: { id: slot.id },
            data: { status: 'occupied' },
          });
        }

        if (reservationId) {
          await tx.reservation.update({
            where: { id: reservationId },
            data: { status: 'fulfilled' },
          });
        }

        const newSession = await this.createParkingSession(tx, {
          source: reservationId ? 'RESERVATION' : 'WALK_IN',
          slotId: slot?.id ?? null,
          floorId: lane.gateLane.floorId ?? null,
          zone: lane.gateLane.vehicleType === 'car' ? 'A' : 'B',
          vehicleType: laneVehicleType,
          plateConfirmed: plateNumberConfirmed,
          plateDisplay,
          plateOcr: plateNumberOcr,
          driverId,
          vehicleId: matchedVehicle?.id ?? null,
          reservationId,
          staffId,
          allocationStrategy,
          allocationTimeMs,
          identificationMethod: identity.source,
        });

        // ── Gate v1.6: Evidence lifecycle ─────────────────────────────────
        if (dto.ocrEvidenceId) {
          // Fast path: explicit evidence ID provided (normal OCR flow)
          await (tx as any).ocrEvidence.update({
            where: { id: dto.ocrEvidenceId },
            data: {
              sessionId: newSession.id,
              confirmedPlate: plateNumberConfirmed,
              wasCorrected: plateNumberOcr ? plateNumberConfirmed !== plateNumberOcr : false,
              vehicleType: laneVehicleType,
              autoReconciled: false,
              staffId,
              reservationId,
              checkInTime: newSession.checkInTime,
            },
          });
          this.logger.log(JSON.stringify({
            event: 'EVIDENCE_LINKED_DIRECTLY',
            sessionId: newSession.id,
            evidenceId: dto.ocrEvidenceId,
            canonicalPlate: plateNumberConfirmed,
            staffId,
          }));
        } else if (identity.source !== 'MANUAL_PLATE') {
          // Auto-reconciliation: search for the best orphan candidate
          await this.attemptAutoReconciliation(
            tx as any,
            newSession,
            { canonicalPlate: plateNumberConfirmed, vehicleType: laneVehicleType, checkInTime: newSession.checkInTime },
            lane.gateLane.cameraId ?? null,
            staffId,
            reservationId,
          );
        } else {
          // MANUAL_PLATE: no evidence — session.identificationMethod is the source of truth
          this.logger.log(JSON.stringify({
            event: 'EVIDENCE_MANUAL_ENTRY',
            sessionId: newSession.id,
            canonicalPlate: plateNumberConfirmed,
            staffId,
          }));
        }

        return newSession;
      }, { timeout: 15000, maxWait: 20000 });
    } catch (error) {
      if (this.isPrismaUniqueConstraintError(error)) {
        const duplicateSession = await this.findActiveSessionForPlate(licensePlate);
        if (!this.isActivePlateUniqueConstraintError(error) && !duplicateSession) {
          throw error;
        }

        this.logger.warn(
          `Duplicate active session rejected | licensePlate=${licensePlate} existingSessionId=${duplicateSession?.id ?? 'unknown'} source=db_unique_constraint`,
        );
        throw new ConflictException('Vehicle already inside parking.');
      }
      throw error;
    }

    await this.notifySessionStarted(session);

    if (reservationId) {
      this.logger.log(
        `Check-in with reservation success | reservationId=${reservationId} sessionId=${session.id} licensePlate=${session.licensePlate} slotId=${session.slot?.id ?? 'none'} staffId=${staffId}`,
      );
    }

    return {
      session: {
        id: session.id,
        licensePlate: session.licensePlate,
        plateDisplay: session.plateDisplay ?? null,
        vehicleType: session.vehicleType,
        checkInTime: session.checkInTime,
        status: session.status,
        allocationStrategy: session.allocationStrategy,
        allocationTimeMs: session.allocationTimeMs,
        reservationId: session.reservationId,
        identificationMethod: identity.source,
      },
      slot: this.mapSessionSlot(session.slot),
      qr_code: session.qrCode ?? null,
      ticket: {
        sessionId: session.id,
        sessionCode: session.sessionCode,
        qrPayload: session.sessionCode,
        qrCode: session.qrCode,
        licensePlate: session.licensePlate,
        plateDisplay: session.plateDisplay ?? null,
        vehicleType: session.vehicleType,
        slotCode: session.slot?.code ?? null,
        floorName: session.floor?.name ?? 'Ground floor',
        floorNumber: session.floor?.floorNumber ?? 0,
        zone: session.zone ?? null,
        checkInTime: session.checkInTime,
        buildingName: process.env.PBMS_BUILDING_NAME ?? 'PBMS Building',
        gateName: process.env.PBMS_GATE_NAME ?? 'Main Gate',
        ticketGeneratedAt: session.ticketGeneratedAt,
      },
    };
  }

  async scanReservation(token: string) {
    const payload = await this.verifyReservationCheckInToken(token);
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: payload.reservationId },
      include: {
        driver: { select: { id: true, fullName: true, phone: true } },
        slot: { include: { floor: true } },
        vehicle: {
          select: {
            id: true,
            plateNumber: true,
            vehicleType: true,
            subscriptions: {
              where: {
                validFrom: { lte: new Date() },
                validTo: { gte: new Date() },
              },
              orderBy: { validTo: 'desc' },
              take: 1,
            },
          },
        },
        session: {
          include: {
            payment: {
              select: {
                status: true,
              },
            },
          },
        },
      },
    });

    if (!reservation) {
      throw new NotFoundException(
        'Reservation not found. Use OCR fallback.',
      );
    }

    if (!reservation.vehicleId || !reservation.vehicle) {
      throw new ConflictException(
        'Reservation has no linked vehicle. Use OCR fallback.',
      );
    }

    if (reservation.vehicleId !== payload.vehicleId) {
      throw new ConflictException(
        'Invalid reservation QR. Use OCR fallback or scan again.',
      );
    }

    if (reservation.status !== 'active') {
      throw new ConflictException(
        this.getReservationCheckInFailureMessage(reservation.status),
      );
    }

    if (reservation.expiresAt.getTime() <= Date.now()) {
      throw new ConflictException(
        'Reservation QR expired. Ask the driver to refresh the QR or use OCR fallback.',
      );
    }

    if (reservation.slot.status !== 'reserved') {
      throw new ConflictException(
        'Reserved slot is no longer available. Use OCR fallback.',
      );
    }

    return {
      reservationId: reservation.id,
      vehicleId: reservation.vehicle.id,
      plateNumber: reservation.vehicle.plateNumber,
      vehicleType: reservation.vehicle.vehicleType,
      slotId: reservation.slot.id,
      slotCode: reservation.slot.code,
      slotLabel: reservation.slot.code.startsWith(reservation.slot.floor.name)
        ? reservation.slot.code
        : `${reservation.slot.code} - ${reservation.slot.floor.name}`,
      driverName: reservation.driver.fullName ?? reservation.driver.phone ?? 'Unknown driver',
      paymentBadge: this.getReservationPaymentBadge({
        subscriptionCount: reservation.vehicle.subscriptions.length,
        paymentStatus: reservation.session?.payment?.status ?? null,
      }),
      expiresAt: reservation.expiresAt,
      fallbackAction: 'USE_OCR_WALKIN',
    };
  }

  async confirmReservationCheckIn(reservationId: string, staffId: string) {
    const lane = await this.gateLanesService.requireActiveLane(staffId);
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const existingSession = await tx.parkingSession.findUnique({
          where: { reservationId },
          include: {
            slot: { include: { floor: true } },
          },
        });

        if (existingSession) {
          return {
            alreadyCheckedIn: true,
            message: 'Already checked in.',
            session: this.mapReservationSessionSummary(existingSession),
            slot: this.mapSessionSlot(existingSession.slot),
          };
        }

        const lockedReservation = await tx.$queryRaw<
          Array<{
            id: string;
          }>
        >`
          SELECT id
          FROM reservations
          WHERE id = ${reservationId}
          FOR UPDATE
        `;

        if (lockedReservation.length === 0) {
          throw new NotFoundException(`Reservation not found: ${reservationId}`);
        }

        const reservation = await tx.reservation.findUnique({
          where: { id: reservationId },
          include: {
            driver: { select: { id: true, fullName: true, phone: true } },
            slot: { include: { floor: true } },
            vehicle: { select: { id: true, plateNumber: true, vehicleType: true } },
            session: {
              include: {
                slot: { include: { floor: true } },
              },
            },
          },
        });

        if (!reservation) {
          throw new NotFoundException(`Reservation not found: ${reservationId}`);
        }

        if (reservation.session) {
          return {
            alreadyCheckedIn: true,
            message: 'Already checked in.',
            session: this.mapReservationSessionSummary(reservation.session),
            slot: this.mapSessionSlot(reservation.session.slot),
          };
        }

        this.assertReservationCanConfirmCheckIn(reservation);
        this.gateLanesService.assertVehicleType(
          lane,
          reservation.vehicle!.vehicleType,
        );

        const lockedSlot = await tx.$queryRaw<{ id: number; status: string }[]>`
          SELECT id, status
          FROM slots
          WHERE id = ${reservation.slotId} AND status = ${'reserved'}::"SlotStatus"
          FOR UPDATE
        `;

        if (lockedSlot.length === 0) {
          throw new ConflictException(
            'Reserved slot is no longer available. Use OCR fallback.',
          );
        }

        const conflictingSession = await tx.parkingSession.findFirst({
          where: {
            vehicleId: reservation.vehicleId,
            status: {
              in: ['active', 'checkout_pending', 'exit_authorized'],
            },
          },
          select: {
            id: true,
            checkInTime: true,
          },
        });

        if (conflictingSession) {
          throw new ConflictException(
            `Vehicle already has an active parking session from ${this.formatCheckInTime(conflictingSession.checkInTime)}.`,
          );
        }

        await tx.reservation.update({
          where: { id: reservationId },
          data: { status: 'fulfilled' },
        });

        await tx.slot.update({
          where: { id: reservation.slotId },
          data: { status: 'occupied' },
        });

        const session = await this.createParkingSession(tx, {
          source: 'RESERVATION',
          slotId: reservation.slotId,
          floorId: reservation.slot.floorId,
          zone: reservation.slot.zone,
          vehicleType: reservation.vehicle!.vehicleType,
          plateConfirmed: reservation.vehicle!.plateNumber,
          plateDisplay: PlateFormatter.toDisplay(reservation.vehicle!.plateNumber),
          plateOcr: null,
          driverId: reservation.driverId,
          vehicleId: reservation.vehicleId,
          reservationId: reservation.id,
          staffId,
          allocationStrategy: 'reservation_qr_checkin',
          allocationTimeMs: 0,
        });

        this.logger.log(
          `Reservation QR check-in success | reservationId=${reservation.id} sessionId=${session.id} vehicleId=${reservation.vehicleId} slotId=${reservation.slotId} staffId=${staffId}`,
        );

        return {
          alreadyCheckedIn: false,
          message: 'Reservation check-in confirmed.',
          session: this.mapReservationSessionSummary(session),
          slot: this.mapSessionSlot(session.slot),
        };
      }, {
        timeout: 15000,
        maxWait: 20000,
      });

      if (!result.alreadyCheckedIn) {
        const createdSession = await this.prisma.parkingSession.findUnique({
          where: { reservationId },
          select: {
            id: true,
            driverId: true,
            licensePlate: true,
            slot: {
              select: {
                code: true,
              },
            },
          },
        });

        if (createdSession) {
          await this.notifySessionStarted(createdSession);
        }
      }

      return result;
    } catch (error) {
      if (this.isPrismaUniqueConstraintError(error)) {
        const existingSession = await this.prisma.parkingSession.findUnique({
          where: { reservationId },
          include: {
            slot: { include: { floor: true } },
          },
        });

        if (existingSession) {
          return {
            alreadyCheckedIn: true,
            message: 'Already checked in.',
            session: this.mapReservationSessionSummary(existingSession),
            slot: this.mapSessionSlot(existingSession.slot),
          };
        }
      }

      throw error;
    }
  }

  private buildSessionCode(sessionId: string): string {
    return `PBMS-${sessionId.replace(/-/g, '').slice(0, 10).toUpperCase()}`;
  }

  private async buildSessionQrCode(sessionCode: string): Promise<string> {
    return QRCode.toDataURL(sessionCode, {
      width: 400,
      margin: 2,
      errorCorrectionLevel: 'H',
      color: { dark: '#000000', light: '#ffffff' },
    });
  }

  private async createParkingSession(
    tx: Prisma.TransactionClient,
    input: CreateSessionInput,
  ) {
    const sessionId = crypto.randomUUID();
    const sessionCode = this.buildSessionCode(sessionId);
    const qrCode = await this.buildSessionQrCode(sessionCode);

    return tx.parkingSession.create({
      data: {
        id: sessionId,
        sessionCode,
        qrCode,
        ticketGeneratedAt: new Date(),
        licensePlate: input.plateConfirmed,
        plateNumberOcr: input.plateOcr ?? null,
        plateNumberConfirmed: input.plateConfirmed,
        plateDisplay: input.plateDisplay ?? null,
        vehicleId: input.vehicleId ?? null,
        vehicleType: input.vehicleType,
        slotId: input.slotId,
        driverId: input.driverId ?? null,
        reservationId: input.reservationId ?? null,
        checkedInById: input.staffId,
        allocationStrategy: input.allocationStrategy,
        allocationTimeMs: input.allocationTimeMs,
        floorId: input.floorId,
        zone: input.zone,
        identificationMethod: input.identificationMethod ?? null,
      } as any,
      include: {
        slot: { include: { floor: true } },
        floor: true,
      },
    });
  }

  /**
   * Gate v1.6: Attempt to find and attach the best orphan OCR evidence
   * when ocrEvidenceId was not explicitly provided at check-in.
   *
   * Scoring:
   *   Required: same canonical plate + sessionId IS NULL + eventType=check_in + capturedAt within ±2 min
   *   +2 bonus:  cameraId matches staff gate lane cameraId
   *   +1 bonus:  vehicleType matches session vehicleType
   *   Tiebreaker: closest capturedAt to checkInTime
   */
  private async attemptAutoReconciliation(
    tx: { ocrEvidence: { findMany: Function; update: Function } },
    session: { id: string; checkInTime: Date },
    criteria: { canonicalPlate: string; vehicleType: string; checkInTime: Date },
    laneCameraId: string | null,
    staffId: string,
    reservationId: string | null,
  ): Promise<void> {
    const twoMin = 2 * 60 * 1000;
    const candidates: Array<{
      id: string;
      capturedAt: Date;
      cameraId: string | null;
      vehicleType: string | null;
    }> = await tx.ocrEvidence.findMany({
      where: {
        sessionId: null,
        eventType: 'check_in',
        canonicalPlate: criteria.canonicalPlate,
        capturedAt: {
          gte: new Date(criteria.checkInTime.getTime() - twoMin),
          lte: new Date(criteria.checkInTime.getTime() + twoMin),
        },
      },
      select: { id: true, capturedAt: true, cameraId: true, vehicleType: true },
      orderBy: { capturedAt: 'desc' },
    });

    if (candidates.length === 0) {
      this.logger.log(JSON.stringify({
        event: 'EVIDENCE_MISSING',
        sessionId: session.id,
        canonicalPlate: criteria.canonicalPlate,
        staffId,
      }));
      return;
    }

    // Score each candidate
    const scored = candidates.map((c) => {
      let score = 0;
      const matchedBy: string[] = ['plate'];
      if (laneCameraId && c.cameraId === laneCameraId) { score += 2; matchedBy.push('lane'); }
      if (c.vehicleType === criteria.vehicleType) { score += 1; matchedBy.push('vehicleType'); }
      const timeDeltaSeconds = Math.round(
        Math.abs(c.capturedAt.getTime() - criteria.checkInTime.getTime()) / 1000,
      );
      matchedBy.push('timestamp');
      return { ...c, score, matchedBy, timeDeltaSeconds };
    });

    // Sort: highest score first, then closest timestamp
    scored.sort((a, b) =>
      b.score !== a.score
        ? b.score - a.score
        : a.timeDeltaSeconds - b.timeDeltaSeconds,
    );

    const topScore = scored[0].score;
    const topCandidates = scored.filter((c) => c.score === topScore);

    if (topCandidates.length > 1) {
      // Ambiguous: multiple same-score candidates — do NOT auto-link
      this.logger.warn(JSON.stringify({
        event: 'EVIDENCE_AMBIGUOUS_MATCH',
        sessionId: session.id,
        canonicalPlate: criteria.canonicalPlate,
        candidateIds: topCandidates.map((c) => c.id),
        staffId,
      }));
      return;
    }

    // Single winner — auto-link
    const winner = topCandidates[0];
    await tx.ocrEvidence.update({
      where: { id: winner.id },
      data: {
        sessionId: session.id,
        autoReconciled: true,
        staffId,
        reservationId,
        checkInTime: session.checkInTime,
      },
    });

    this.logger.log(JSON.stringify({
      event: 'EVIDENCE_AUTO_RECONCILED',
      sessionId: session.id,
      evidenceId: winner.id,
      canonicalPlate: criteria.canonicalPlate,
      matchedBy: winner.matchedBy,
      score: winner.score,
      timeDeltaSeconds: winner.timeDeltaSeconds,
      autoReconciled: true,
      staffId,
    }));
  }

  /**
   * Gate v1.6: Runtime-derive the evidence status from the evidence record
   * and the session's identificationMethod. No status enum is persisted.
   */
  private deriveEvidenceStatus(
    evidence: { autoReconciled: boolean } | null,
    identificationMethod: string | null | undefined,
  ): 'LINKED' | 'AUTO_RECONCILED' | 'MANUAL_ENTRY' | 'MISSING' {
    if (!evidence) {
      if (identificationMethod === 'MANUAL_PLATE') return 'MANUAL_ENTRY';
      return 'MISSING';
    }
    if (evidence.autoReconciled) return 'AUTO_RECONCILED';
    return 'LINKED';
  }

  private async notifySessionStarted(session: {
    id: string;
    driverId?: string | null;
    licensePlate: string;
    slot?: { code: string } | null;
  }) {
    if (!session.driverId) {
      return;
    }

    try {
      await this.notificationsService.createForUser({
        userId: session.driverId,
        type: NotificationType.session_started,
        title: 'Session started',
        message: `Xe ${session.licensePlate} da check-in${session.slot?.code ? `, slot ${session.slot.code}` : ''}.`,
        relatedSessionId: session.id,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to create session-started notification | sessionId=${session.id} driverId=${session.driverId} error=${String(error)}`,
      );
    }
  }

  private async verifyReservationCheckInToken(
    token: string,
  ): Promise<ReservationCheckInTokenPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<ReservationCheckInTokenPayload>(token);

      if (
        payload.typ !== RESERVATION_CHECKIN_TOKEN_TYPE ||
        !payload.reservationId ||
        !payload.vehicleId ||
        !payload.driverId
      ) {
        throw new BadRequestException(
          'Invalid reservation QR. Use OCR fallback or scan again.',
        );
      }

      return payload;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      if (
        typeof error === 'object' &&
        error !== null &&
        'name' in error &&
        (error as { name?: string }).name === 'TokenExpiredError'
      ) {
        throw new ConflictException(
          'Reservation QR expired. Ask the driver to refresh the QR or use OCR fallback.',
        );
      }

      throw new BadRequestException(
        'Invalid reservation QR. Use OCR fallback or scan again.',
      );
    }
  }

  async issueTicket(sessionId: string, staffId: string) {
    const lane = await this.gateLanesService.requireActiveLane(staffId);
    const session = await this.prisma.parkingSession.findUnique({
      where: { id: sessionId },
      select: { id: true, vehicleType: true },
    });
    if (!session) {
      throw new NotFoundException(`Session not found: ${sessionId}`);
    }
    this.gateLanesService.assertVehicleType(lane, session.vehicleType);
    const updated = await (this.prisma as any).parkingSession.update({
      where: { id: sessionId },
      data: {
        ticketIssuedAt: new Date(),
        ticketIssuedByStaffId: staffId,
      },
    });

    return {
      sessionId: updated.id,
      ticketIssuedAt: updated.ticketIssuedAt,
      ticketIssuedByStaffId: updated.ticketIssuedByStaffId,
    };
  }

  private isPrismaUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002'
    );
  }

  private isActivePlateUniqueConstraintError(error: unknown): boolean {
    if (
      typeof error !== 'object' ||
      error === null ||
      !('meta' in error)
    ) {
      return false;
    }

    const target = (error as { meta?: { target?: unknown } }).meta?.target;
    if (Array.isArray(target)) {
      return target.includes('license_plate') || target.includes('licensePlate');
    }

    return target === 'uniq_active_plate' || target === 'license_plate';
  }

  private async findActiveSessionForPlate(licensePlate: string): Promise<{
    id: string;
    checkInTime: Date;
  } | null> {
    return this.prisma.parkingSession.findFirst({
      where: {
        licensePlate,
        status: 'active',
      },
      select: {
        id: true,
        checkInTime: true,
      },
      orderBy: {
        checkInTime: 'asc',
      },
    });
  }

  private formatCheckInTime(value: Date): string {
    return new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(value);
  }

  private mapBreakdownToCheckoutFee(breakdown: FeeBreakdown) {
    return {
      durationHours: breakdown.roundedHours,
      originalBaseFee: breakdown.originalBaseFee,
      reservationDiscountPercent: breakdown.reservationDiscountPercent,
      reservationDiscountAmount: breakdown.reservationDiscountAmount,
      baseFee: breakdown.baseFee,
      penalty: breakdown.overtimePenalty + breakdown.lostTicketPenalty,
      total: breakdown.totalFee,
      isOvertime: breakdown.isOvertime,
      isLostTicket: breakdown.isLostTicket,
      checkOutTime: breakdown.checkOutTime,
      isSubscriber: breakdown.isSubscriber,
      hasReservation: breakdown.hasReservation,
    };
  }

  private async buildCheckoutLookupPreview(session: {
    id: string;
    sessionCode: string;
    reservationId: string | null;
    licensePlate: string;
    plateDisplay?: string | null;
    vehicleType: VehicleType;
    vehicleId: string | null;
    checkInTime: Date;
    checkOutTime: Date | null;
    status: SessionStatus;
    allocationStrategy: string | null;
    isPaid: boolean;
    feeAmount: number;
    penaltyAmount: number;
    isOvertime: boolean;
    isLostTicket: boolean;
    identificationMethod?: string | null;
    plateNumberOcr?: string | null;
    plateNumberConfirmed?: string | null;
    checkedInById?: string | null;
    checkedInBy?: { fullName: string } | null;
    floorId?: number | null;
    zone?: Zone | null;
    floor?: { id: number; floorNumber: number; name: string } | null;
    driver?: { fullName: string; phone: string } | null;
    reservation?: { driver?: { fullName: string; phone: string } | null; lockedHourlyRate?: number | null } | null;
    vehicle?: { vehicleUsers?: Array<{ role?: string; user?: { fullName: string; phone: string } }> } | null;
    slot: {
      id: number;
      code: string;
      status: string;
      zone: Zone;
      floor: {
        id: number;
        floorNumber: number;
        name: string;
      };
    };
    payment: {
      id: string;
      sessionId: string;
      amount: number;
      method: PaymentMethod;
      status?: string | null;
      paidAt: Date | null;
      receivedBy: string | null;
      checkoutUrl?: string | null;
      qrCode?: string | null;
      expiredAt?: Date | null;
    } | null;
  }) {
    let driverName: string | null = null;
    let driverPhone: string | null = null;

    if (session.driver?.fullName) {
      driverName = session.driver.fullName;
      driverPhone = session.driver.phone;
    } else if (session.reservation?.driver?.fullName) {
      driverName = session.reservation.driver.fullName;
      driverPhone = session.reservation.driver.phone;
    } else if (session.vehicle?.vehicleUsers) {
      const owner = session.vehicle.vehicleUsers.find((vu) => vu.role === 'owner')?.user;
      if (owner?.fullName) {
        driverName = owner.fullName;
        driverPhone = owner.phone;
      } else if (session.vehicle.vehicleUsers.length > 0 && session.vehicle.vehicleUsers[0].user?.fullName) {
        const firstDriver = session.vehicle.vehicleUsers[0].user;
        driverName = firstDriver.fullName;
        driverPhone = firstDriver.phone;
      }
    }

    const breakdown = await this.feesService.calculate(
      session,
      session.isLostTicket,
      session.checkOutTime ?? new Date(),
      undefined,
      session.reservation?.lockedHourlyRate ?? null,
    );

    const checkInEvidence = await this.ocrService.getCheckInEvidenceForSession(session.id);

    return {
      session: {
        id: session.id,
        sessionCode: session.sessionCode,
        reservationId: session.reservationId,
        licensePlate: session.licensePlate,
        plateDisplay: session.plateDisplay ?? null,
        vehicleType: session.vehicleType,
        checkInTime: session.checkInTime,
        checkOutTime: session.checkOutTime,
        status: session.status,
        allocationStrategy: session.allocationStrategy,
        isPaid: session.isPaid,
        feeAmount: session.feeAmount,
        penaltyAmount: session.penaltyAmount,
        isOvertime: session.isOvertime,
        isLostTicket: session.isLostTicket,
        driverName,
        driverPhone,
        identificationMethod: session.identificationMethod ?? null,
        plateNumberOcr: session.plateNumberOcr ?? null,
        plateNumberConfirmed: session.plateNumberConfirmed ?? null,
        checkedInById: session.checkedInById ?? null,
        checkedInByName: session.checkedInBy?.fullName ?? null,
        floorId: session.floorId ?? null,
        zone: session.zone ?? null,
        floor: session.floor
          ? { id: session.floor.id, floorNumber: session.floor.floorNumber, name: session.floor.name }
          : null,
      },
      slot: this.mapSessionSlot(session.slot),
      fee: this.mapBreakdownToCheckoutFee(breakdown),
      payment: session.payment
        ? {
            id: session.payment.id,
            sessionId: session.payment.sessionId,
            amount: session.payment.amount,
            method: session.payment.method,
            status: session.payment.status ?? null,
            paidAt: session.payment.paidAt,
            receivedBy: session.payment.receivedBy,
            checkoutUrl: session.payment.checkoutUrl ?? null,
            qrCode: session.payment.qrCode ?? null,
            expiredAt: session.payment.expiredAt ?? null,
          }
        : null,
      checkInEvidence: checkInEvidence
        ? {
            id: checkInEvidence.id,
            status: this.deriveEvidenceStatus(checkInEvidence, session.identificationMethod),
            thumbnailUrl: checkInEvidence.thumbnailKey
              ? `/api/ocr-evidences/${checkInEvidence.id}/thumbnail`
              : null,
            imageUrl: checkInEvidence.imageKey
              ? `/api/ocr-evidences/${checkInEvidence.id}/image`
              : null,
            capturedAt: checkInEvidence.capturedAt,
            ocrPlate: checkInEvidence.ocrPlate,
            confirmedPlate: checkInEvidence.confirmedPlate,
            ocrConfidence: checkInEvidence.ocrConfidence,
            vehicleType: checkInEvidence.vehicleType,
          }
        : {
            status: this.deriveEvidenceStatus(null, session.identificationMethod),
            thumbnailUrl: null,
            imageUrl: null,
            capturedAt: null,
            ocrPlate: null,
            confirmedPlate: null,
            ocrConfidence: null,
            vehicleType: null,
          },
    };
  }

  private assertReservationCanBeFulfilled(
    reservation: {
      id: string;
      vehicleType: VehicleType;
      status: string;
      expiresAt?: Date | null;
      slot?: { status?: string } | null;
    } | null,
    vehicleType: VehicleType,
  ): asserts reservation is {
    id: string;
    vehicleType: VehicleType;
    status: string;
    expiresAt?: Date | null;
    slot: { status?: string };
  } {
    if (!reservation) {
      throw new NotFoundException('Active reservation not found');
    }

    if (reservation.status !== 'active') {
      if (reservation.status === 'expired') {
        this.logger.warn(
          `Expired reservation check-in rejected | reservationId=${reservation.id} requestedVehicleType=${vehicleType}`,
        );
      } else {
        this.logger.warn(
          `Reservation check-in rejected | reservationId=${reservation.id} status=${reservation.status} requestedVehicleType=${vehicleType}`,
        );
      }
      throw new ConflictException(
        `Reservation ${reservation.id} is already ${reservation.status}`,
      );
    }

    if (reservation.expiresAt && reservation.expiresAt.getTime() <= Date.now()) {
      this.logger.warn(
        `Expired reservation check-in rejected | reservationId=${reservation.id} expiresAt=${reservation.expiresAt.toISOString()} requestedVehicleType=${vehicleType}`,
      );
      throw new ConflictException(`Reservation ${reservation.id} is expired`);
    }

    if (reservation.vehicleType !== vehicleType) {
      this.logger.warn(
        `Vehicle type mismatch rejected | reservationId=${reservation.id} reservationVehicleType=${reservation.vehicleType} requestedVehicleType=${vehicleType}`,
      );
      throw new ConflictException(
        `Reservation ${reservation.id} is for ${reservation.vehicleType}, not ${vehicleType}`,
      );
    }

    if (!reservation.slot) {
      throw new ConflictException(`Reservation ${reservation.id} has no assigned slot`);
    }

    if (reservation.slot.status && reservation.slot.status !== 'reserved') {
      throw new ConflictException(
        `Reserved slot for reservation ${reservation.id} is ${reservation.slot.status}`,
      );
    }
  }

  private assertReservationCanConfirmCheckIn(
    reservation: {
      id: string;
      vehicleId: string | null;
      vehicle: { id: string; plateNumber: string; vehicleType: VehicleType } | null;
      slot: { status: string | null } | null;
      status: string;
      expiresAt: Date | null;
    },
  ): void {
    if (reservation.status !== 'active') {
      throw new ConflictException(
        this.getReservationCheckInFailureMessage(reservation.status),
      );
    }

    if (reservation.expiresAt && reservation.expiresAt.getTime() <= Date.now()) {
      throw new ConflictException(
        'Reservation QR expired. Ask the driver to refresh the QR or use OCR fallback.',
      );
    }

    if (!reservation.vehicleId || !reservation.vehicle) {
      throw new ConflictException(
        'Reservation has no linked vehicle. Use OCR fallback.',
      );
    }

    if (!reservation.slot || reservation.slot.status !== 'reserved') {
      throw new ConflictException(
        'Reserved slot is no longer available. Use OCR fallback.',
      );
    }
  }

  private getReservationCheckInFailureMessage(status: string): string {
    if (status === 'fulfilled') {
      return 'Reservation already checked in. Use OCR fallback.';
    }

    if (status === 'expired') {
      return 'Reservation QR expired. Ask the driver to refresh the QR or use OCR fallback.';
    }

    if (status === 'cancelled') {
      return 'Reservation is not active. Use OCR fallback.';
    }

    return 'Reservation is not active. Use OCR fallback.';
  }

  private getReservationPaymentBadge(input: {
    subscriptionCount: number;
    paymentStatus: string | null;
  }): 'Paid' | 'Auto-pay' | 'Pay on exit' {
    if (input.paymentStatus === 'paid') {
      return 'Paid';
    }

    if (input.subscriptionCount > 0) {
      return 'Auto-pay';
    }

    return 'Pay on exit';
  }

  private mapReservationSessionSummary(session: {
    id: string;
    reservationId: string | null;
    vehicleId: string | null;
    licensePlate: string;
    plateDisplay?: string | null;
    vehicleType: VehicleType;
    checkInTime: Date;
    status: string;
    sessionCode: string;
  }) {
    return {
      id: session.id,
      reservationId: session.reservationId,
      vehicleId: session.vehicleId,
      licensePlate: session.licensePlate,
      plateDisplay: session.plateDisplay ?? null,
      vehicleType: session.vehicleType,
      checkInTime: session.checkInTime,
      status: session.status,
      sessionCode: session.sessionCode,
    };
  }

  private mapSessionSlot(slot: {
    id: number;
    code: string;
    zone: string;
    floor: {
      id: number;
      floorNumber: number;
      name: string;
    };
  } | null | undefined) {
    if (!slot) return null;
    return {
      id: slot.id,
      code: slot.code,
      zone: slot.zone,
      floor: {
        id: slot.floor.id,
        floorNumber: slot.floor.floorNumber,
        name: slot.floor.name,
      },
    };
  }

  /**
   * 15.1–15.3: Check-out a vehicle.
   *
   * Flow:
   * 1. Lookup active session by session_id (QR) or license_plate
   * 2. Calculate fee breakdown via FeesService
   * 3. If duration > threshold, flag overtime + log warning
   * 4. Move session to checkout_pending and create/update pending payment
   * 5. Return fee breakdown for Staff to confirm
   *
   * Req 2.1–2.3, 5.5
   */
  async checkOut(dto: CheckOutDto, staffId: string) {
    const lane = await this.gateLanesService.requireActiveLane(staffId);
    // 15.1: Validate at least one identifier provided
    if (!dto.sessionId && !dto.licensePlate) {
      throw new BadRequestException(
        'Either sessionId or licensePlate must be provided',
      );
    }

    // 15.1: Lookup active session
    const session = await this.prisma.parkingSession.findFirst({
      where: {
        status: 'active',
        ...(dto.sessionId
          ? { OR: [{ id: dto.sessionId }, { sessionCode: dto.sessionId }] }
          : { licensePlate: dto.licensePlate }),
      },
      include: {
        slot: { include: { floor: true } },
        checkOutLane: true,
        floor: true,
      },
    });

    if (!session) {
      // Fallback: look up the session regardless of status so we can return a
      // clear, actionable message instead of a cryptic "No active session found".
      const anySession = await this.prisma.parkingSession.findFirst({
        where: dto.sessionId
          ? { OR: [{ id: dto.sessionId }, { sessionCode: dto.sessionId }] }
          : { licensePlate: dto.licensePlate },
        select: { sessionCode: true, status: true, licensePlate: true },
      });
      if (anySession) {
        const label: Record<string, string> = {
          active: 'đang đỗ trong bãi',
          checkout_pending: 'đang xử lý thanh toán',
          exit_authorized: 'đã được xác nhận ra cổng',
          completed: 'đã hoàn tất ra cổng',
          lost_ticket: 'đang xử lý vé thất lạc',
        };
        const state = label[anySession.status] ?? anySession.status;
        if (anySession.status === 'exit_authorized' || anySession.status === 'completed') {
          throw new ConflictException(
            `Xe ${anySession.licensePlate} (${anySession.sessionCode}) ${state}. Không thể checkout lại.`,
          );
        }
        throw new ConflictException(
          `Phiên ${anySession.sessionCode} hiện đang ${state}, chưa sẵn sàng để checkout.`,
        );
      }
      throw new NotFoundException(
        `Không tìm thấy phiên cho ${dto.sessionId ? `mã ${dto.sessionId}` : `biển số ${dto.licensePlate}`}.`,
      );
    }
    this.gateLanesService.assertVehicleType(lane, session.vehicleType);

    // 15.2: Calculate fee breakdown via FeesService
    const now = new Date();

    // BR-09/10: Fetch locked rate from reservation if applicable
    let lockedRate: number | null = null;
    if (session.reservationId) {
      const reservation = await this.prisma.reservation.findUnique({
        where: { id: session.reservationId },
        select: { lockedHourlyRate: true },
      });
      lockedRate = reservation?.lockedHourlyRate ?? null;
    }

    const breakdown = await this.feesService.calculate(
      session,
      false,
      now,
      undefined,
      lockedRate,
    );

    // 15.3: Flag overtime + log warning if duration > threshold
    if (breakdown.isOvertime) {
      this.logger.warn(
        `Overtime detected: session ${session.id}, plate ${session.licensePlate}, ` +
          `duration ${breakdown.roundedHours}h (threshold exceeded)`,
      );
    }

    const payment = await this.prisma.$transaction(async (tx) => {
      await tx.parkingSession.update({
        where: { id: session.id },
        data: {
          status: 'checkout_pending',
          feeAmount: breakdown.baseFee,
          penaltyAmount: breakdown.overtimePenalty + breakdown.lostTicketPenalty,
          isOvertime: breakdown.isOvertime,
          isLostTicket: breakdown.isLostTicket,
          checkOutLaneId: dto.gateLaneId ?? lane.gateLane.id,
        } as any,
      });

      return tx.payment.upsert({
        where: { sessionId: session.id },
        create: {
          sessionId: session.id,
          amount: breakdown.totalFee,
          method: PaymentMethod.cash,
          status: 'pending',
          paidAt: null,
          receivedBy: null,
        } as any,
        update: {
          amount: breakdown.totalFee,
          method: PaymentMethod.cash,
          status: 'pending',
          paidAt: null,
          receivedBy: null,
        } as any,
      });
    }, { timeout: 15000, maxWait: 20000 });

    return {
      session: {
        id: session.id,
        sessionCode: session.sessionCode,
        reservationId: session.reservationId,
        licensePlate: session.licensePlate,
        plateDisplay: session.plateDisplay ?? null,
        vehicleType: session.vehicleType,
        checkInTime: session.checkInTime,
        checkOutTime: session.checkOutTime,
        status: 'checkout_pending',
        allocationStrategy: session.allocationStrategy,
        driverId: session.driverId,
        isPaid: session.isPaid,
        feeAmount: breakdown.baseFee,
        penaltyAmount: breakdown.overtimePenalty + breakdown.lostTicketPenalty,
        isOvertime: breakdown.isOvertime,
        isLostTicket: breakdown.isLostTicket,
      },
      slot: this.mapSessionSlot(session.slot),
      checkOutLane: session.checkOutLane
        ? { id: session.checkOutLane.id, code: session.checkOutLane.code, vehicleType: session.checkOutLane.vehicleType }
        : null,
      breakdown,
      payment: {
        id: payment.id,
        amount: payment.amount,
        method: payment.method,
        status: (payment as any).status,
        paidAt: payment.paidAt,
      },
    };
  }

  /**
   * 15.4–15.6: Confirm payment and authorize exit.
   *
   * Flow:
   * 1. Lookup checkout_pending session by ID
   * 2. Recalculate fee (with lost ticket flag if provided)
   * 3. In transaction: update Payment to paid and session to exit_authorized
   * 4. Return receipt/exit authorization. Slot release happens in confirmExit().
   *
   * Req 2.4, 2.5, 5.5, 6.2, 6.4
   */
  async confirmPayment(
    sessionId: string,
    dto: ConfirmPaymentDto,
    staffId: string,
  ) {
    const lane = await this.gateLanesService.requireActiveLane(staffId);
    // Lookup checkout pending session
    const session = await this.prisma.parkingSession.findUnique({
      where: { id: sessionId },
      include: {
        slot: { include: { floor: true } },
      },
    });

    if (!session) {
      throw new NotFoundException(`Session not found: ${sessionId}`);
    }
    this.gateLanesService.assertVehicleType(lane, session.vehicleType);

    if ((session.status as string) !== 'checkout_pending') {
      throw new ConflictException(
        `Session ${sessionId} is already ${session.status}`,
      );
    }

    // Recalculate fee at confirmation time (with lost ticket flag)
    const now = new Date();
    const isLost = dto.isLostTicket ?? false;

    // BR-09/10: Fetch locked rate from reservation if applicable
    let lockedRate: number | null = null;
    if (session.reservationId) {
      const reservation = await this.prisma.reservation.findUnique({
        where: { id: session.reservationId },
        select: { lockedHourlyRate: true },
      });
      lockedRate = reservation?.lockedHourlyRate ?? null;
    }

    const breakdown = await this.feesService.calculate(
      session,
      isLost,
      now,
      undefined,
      lockedRate,
    );
    const method = dto.method ?? PaymentMethod.cash;

    // 15.4–15.5: Payment confirmation authorizes exit.
    const result = await this.prisma.$transaction(async (tx) => {
      const existingPayment = await tx.payment.findUnique({
        where: { sessionId },
      });

      if (!existingPayment) {
        await tx.payment.create({
          data: {
            sessionId,
            amount: breakdown.totalFee,
            method,
            status: 'pending',
            paidAt: null,
            receivedBy: null,
          } as any,
        });
      }

      const payment = await tx.payment.update({
        where: { sessionId },
        data: {
          amount: breakdown.totalFee,
          method,
          status: 'paid',
          paidAt: now,
          receivedBy: staffId,
        } as any,
      });

      const updatedSession = await tx.parkingSession.update({
        where: { id: sessionId },
        data: {
          status: 'exit_authorized',
          checkedOutById: staffId,
          feeAmount: breakdown.baseFee,
          penaltyAmount: breakdown.overtimePenalty + breakdown.lostTicketPenalty,
          isPaid: true,
          isOvertime: breakdown.isOvertime,
          isLostTicket: isLost,
        } as any,
      });

      return { updatedSession, payment };
    }, { timeout: 15000, maxWait: 20000 });

    // 15.6: Return receipt (Req 6.4)
    return {
      receipt: {
        sessionId: session.id,
        licensePlate: session.licensePlate,
        plateDisplay: session.plateDisplay ?? null,
        vehicleType: session.vehicleType,
        slot: this.mapSessionSlot(session.slot),
        checkInTime: session.checkInTime,
        checkOutTime: now,
        durationHours: breakdown.roundedHours,
        breakdown: {
          hourlyRate: breakdown.hourlyRate,
          roundedHours: breakdown.roundedHours,
          originalBaseFee: breakdown.originalBaseFee,
          reservationDiscountPercent: breakdown.reservationDiscountPercent,
          reservationDiscountAmount: breakdown.reservationDiscountAmount,
          baseFee: breakdown.baseFee,
          isOvertime: breakdown.isOvertime,
          overtimePenalty: breakdown.overtimePenalty,
          isLostTicket: isLost,
          lostTicketPenalty: breakdown.lostTicketPenalty,
          totalFee: breakdown.totalFee,
          hasReservation: breakdown.hasReservation,
        },
        payment: {
          id: result.payment.id,
          amount: result.payment.amount,
          method: result.payment.method,
          status: (result.payment as any).status,
          paidAt: result.payment.paidAt,
        },
        exitAuthorizationStatus: result.updatedSession.status,
      },
    };
  }

  /**
   * Flow 4A.1: Staff confirms the vehicle actually exited.
   * This is the only point where the slot is released.
   */
  async confirmExit(sessionId: string, staffId: string) {
    const lane = await this.gateLanesService.requireActiveLane(staffId);
    const session = await this.prisma.parkingSession.findUnique({
      where: { id: sessionId },
      include: {
        slot: { include: { floor: true } },
      },
    });

    if (!session) {
      throw new NotFoundException(`Session not found: ${sessionId}`);
    }
    this.gateLanesService.assertVehicleType(lane, session.vehicleType);

    if ((session.status as string) !== 'exit_authorized') {
      throw new ConflictException(
        `Session ${sessionId} must be exit_authorized before exit confirmation`,
      );
    }

    const now = new Date();
    const updatedSession = await this.prisma.$transaction(async (tx) => {
      const completed = await tx.parkingSession.update({
        where: { id: sessionId },
        data: {
          status: 'completed',
          checkOutTime: now,
          checkedOutById: staffId,
        } as any,
      });

      await tx.slot.update({
        where: { id: session.slotId },
        data: { status: 'available' },
      });

      return completed;
    }, { timeout: 15000, maxWait: 20000 });

    return {
      session: {
        id: updatedSession.id,
        status: updatedSession.status,
        checkOutTime: updatedSession.checkOutTime,
        checkedOutById: updatedSession.checkedOutById,
      },
      slot: this.mapSessionSlot(session.slot),
    };
  }

  /**
   * Get a single session by ID.
   * Accessible by Staff and the owning Driver.
   */
  async findOne(id: string, userId?: string, role?: string) {
    const session = await this.prisma.parkingSession.findUnique({
      where: { id },
      include: {
        slot: { include: { floor: true } },
        floor: true,
        driver: { select: { id: true, phone: true, fullName: true } },
        checkedInBy: { select: { id: true, phone: true, fullName: true } },
      },
    });

    if (!session) {
      throw new NotFoundException(`Session with id "${id}" not found`);
    }

    // BOLA: a driver requesting a session they do not own gets 404, not 403.
    // Returning 403 here would let a driver enumerate valid session IDs by
    // distinguishing "exists but not yours" from "does not exist".
    if (role === 'driver' && session.driverId !== userId) {
      throw new NotFoundException(`Session with id "${id}" not found`);
    }

    return session;
  }

  /**
   * List all currently active sessions.
   * Accessible by Staff.
   */
  async findActive() {
    return this.prisma.parkingSession.findMany({
      where: { status: 'active' },
      include: {
        slot: { include: { floor: true } },
        driver: { select: { id: true, phone: true, fullName: true } },
      },
      orderBy: { checkInTime: 'asc' },
    });
  }

  /**
   * Flow 4A.2: read-only lookup for the Staff checkout workspace.
   * This must not move the session lifecycle forward.
   */
  async lookupForCheckout(input: {
    sessionCode?: string;
    licensePlate?: string;
  }, staffId?: string) {
    const lane = staffId ? await this.gateLanesService.requireActiveLane(staffId) : null;
    const sessionCode = input.sessionCode?.trim();
    const licensePlate = normalizePlateNumber(input.licensePlate);

    if (!sessionCode && !licensePlate) {
      throw new BadRequestException(
        'Either sessionCode or licensePlate must be provided',
      );
    }

    const session = await this.prisma.parkingSession.findFirst({
      where: sessionCode
        ? { OR: [{ id: sessionCode }, { sessionCode }] }
        : { licensePlate },
      include: {
        slot: { include: { floor: true } },
        payment: true,
        reservation: {
          select: {
            driver: {
              select: {
                fullName: true,
                phone: true,
              },
            },
            lockedHourlyRate: true,
          },
        },
        driver: {
          select: {
            fullName: true,
            phone: true,
          },
        },
        vehicle: {
          include: {
            vehicleUsers: {
              include: {
                user: {
                  select: {
                    fullName: true,
                    phone: true,
                  },
                },
              },
            },
          },
        },
        checkedInBy: {
          select: {
            fullName: true,
          },
        },
      },
      orderBy: { checkInTime: 'desc' },
    });

    if (!session) {
      throw new NotFoundException('Parking session not found.');
    }
    if (lane) this.gateLanesService.assertVehicleType(lane, session.vehicleType);

    return this.buildCheckoutLookupPreview(session);
  }

  async lookupOpenForGateByPlate(licensePlate: string) {
    const normalizedPlate = normalizePlateNumber(licensePlate);
    if (!normalizedPlate) {
      throw new BadRequestException('licensePlate is required');
    }

    const session = await this.prisma.parkingSession.findFirst({
      where: {
        status: {
          in: [
            SessionStatus.active,
            SessionStatus.checkout_pending,
            SessionStatus.exit_authorized,
          ],
        },
        OR: [
          { licensePlate: normalizedPlate },
          { plateNumberConfirmed: normalizedPlate },
        ],
      },
      include: {
        slot: { include: { floor: true } },
        payment: true,
        reservation: {
          select: {
            driver: {
              select: {
                fullName: true,
                phone: true,
              },
            },
            lockedHourlyRate: true,
          },
        },
        driver: {
          select: {
            fullName: true,
            phone: true,
          },
        },
        vehicle: {
          include: {
            vehicleUsers: {
              include: {
                user: {
                  select: {
                    fullName: true,
                    phone: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { checkInTime: 'desc' },
    });

    if (!session) {
      return null;
    }

    return this.buildCheckoutLookupPreview(session);
  }

  /**
   * 23.3 / 23.4: List sessions for a specific driver, filtered by status.
   */
  async findByDriver(driverId: string, status: 'active' | 'completed') {
    // Find driver's linked vehicles and license plates
    const linkedVehicles = await this.prisma.vehicleUser.findMany({
      where: { userId: driverId },
      select: { vehicleId: true, vehicle: { select: { plateNumber: true } } },
    });
    const vehicleIds = linkedVehicles.map((v) => v.vehicleId);
    const plateNumbers = linkedVehicles
      .map((v) => v.vehicle?.plateNumber)
      .filter((p): p is string => Boolean(p));

    const sessions = await this.prisma.parkingSession.findMany({
      where: {
        OR: [
          { driverId },
          ...(vehicleIds.length > 0 ? [{ vehicleId: { in: vehicleIds } }] : []),
          ...(plateNumbers.length > 0 ? [{ licensePlate: { in: plateNumbers } }] : []),
        ],
        status:
          status === 'active'
            ? { in: [SessionStatus.active, SessionStatus.checkout_pending, SessionStatus.exit_authorized] }
            : SessionStatus.completed,
      },
      include: {
        slot: { include: { floor: true } },
        payment: true,
      },
      orderBy: { checkInTime: 'desc' },
    });

    return sessions.map((s) => ({
      ...s,
      feeAmount: s.feeAmount ?? s.payment?.amount ?? 0,
      penaltyAmount: s.penaltyAmount ?? 0,
    }));
  }

  async assertDriverOwnsSession(sessionId: string, driverId: string) {
    const session = await this.prisma.parkingSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        driverId: true,
      },
    });

    if (!session) {
      throw new NotFoundException(`Session not found: ${sessionId}`);
    }

    // BOLA: ownership mismatch returns 404 (not 403) to avoid ID enumeration.
    if (session.driverId !== driverId) {
      throw new NotFoundException(`Session not found: ${sessionId}`);
    }

    return session;
  }

  /**
   * 21: Get QR code for a session.
   * Returns the stored base64 data URL, or generates one if missing.
   * Accessible by Staff and the owning Driver.
   */
  async getQrCode(sessionId: string, userId?: string, role?: string) {
    const session = await this.prisma.parkingSession.findUnique({
      where: { id: sessionId },
      select: { id: true, sessionCode: true, qrCode: true, driverId: true },
    });

    if (!session) {
      throw new NotFoundException(`Session not found: ${sessionId}`);
    }

    // BOLA: ownership mismatch returns 404 (not 403) to avoid ID enumeration.
    if (role === 'driver' && session.driverId !== userId) {
      throw new NotFoundException(`Session not found: ${sessionId}`);
    }

    // If QR was already generated at check-in, return it
    if (session.qrCode) {
      return { sessionId: session.id, sessionCode: session.sessionCode, qrCode: session.qrCode };
    }

    // Generate QR on-demand (for sessions that didn't have a registered driver at check-in)
    const qrPayload = session.sessionCode ?? sessionId;
    const qrCode = await QRCode.toDataURL(qrPayload, {
      width: 400,
      margin: 2,
      errorCorrectionLevel: 'H',
      color: { dark: '#000000', light: '#ffffff' },
    });

    // Persist for future requests
    await this.prisma.parkingSession.update({
      where: { id: sessionId },
      data: { qrCode },
    });

    return { sessionId: session.id, sessionCode: session.sessionCode, qrCode };
  }

  /**
   * 24.1–24.3: Handle lost ticket.
   *
   * Flow:
   * 1. Lookup active session by license plate
   * 2. Record ID verification info (id_card_no, driver_license_no)
   * 3. Set isLostTicket flag on session
   * 4. Calculate fee with lost ticket penalty
   * 5. Return fee breakdown for staff to confirm payment
   *
   * Req 5.6, 7.3
   */
  async handleLostTicket(dto: LostTicketDto, staffId: string) {
    const lane = await this.gateLanesService.requireActiveLane(staffId);
    // 24.2: Lookup active session by plate
    const session = await this.prisma.parkingSession.findFirst({
      where: {
        licensePlate: dto.licensePlate,
        status: 'active',
      },
      include: {
        slot: { include: { floor: true } },
        reservation: {
          select: { lockedHourlyRate: true },
        },
      },
    });

    if (!session) {
      throw new NotFoundException(
        `Không tìm thấy phiên gửi xe cho biển số: ${dto.licensePlate}`,
      );
    }
    this.gateLanesService.assertVehicleType(lane, session.vehicleType);

    // 24.2: Set lost ticket flag and record ID info
    await this.prisma.parkingSession.update({
      where: { id: session.id },
      data: {
        isLostTicket: true,
        idCardNo: dto.idCardNo,
        driverLicenseNo: dto.driverLicenseNo,
      },
    });

    // 24.3: Calculate fee with lost ticket penalty (100k)
    const now = new Date();
    const breakdown = await this.feesService.calculate(
      session,
      true,
      now,
      undefined,
      session.reservation?.lockedHourlyRate ?? null,
    );

    this.logger.warn(
      `Lost ticket processed: session ${session.id}, plate ${dto.licensePlate}, ` +
        `ID card: ${dto.idCardNo}, staff: ${staffId}`,
    );

    return {
      session: {
        id: session.id,
        licensePlate: session.licensePlate,
        plateDisplay: session.plateDisplay ?? null,
        vehicleType: session.vehicleType,
        checkInTime: session.checkInTime,
        isLostTicket: true,
      },
      slot: this.mapSessionSlot(session.slot),
      breakdown,
    };
  }
}
