import { Injectable, NotFoundException } from '@nestjs/common';
import { ParkingSession, VehicleType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PricingResolver } from '../config-mgmt/pricing-resolver.service';

export interface FeeBreakdown {
  sessionId: string;
  vehicleType: VehicleType;
  checkInTime: Date;
  checkOutTime: Date;
  durationMs: number;
  durationHours: number;
  roundedHours: number;
  hourlyRate: number;
  originalBaseFee: number;
  reservationDiscountPercent: number;
  reservationDiscountAmount: number;
  baseFee: number;
  isOvertime: boolean;
  overtimePenalty: number;
  isLostTicket: boolean;
  lostTicketPenalty: number;
  totalFee: number;
  isSubscriber: boolean;
  hasReservation: boolean;
}

@Injectable()
export class FeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: PricingResolver,
  ) {}

  /**
   * 14.1: Calculate fee for a parking session.
   *
   * Logic:
   * - BR-05: Segmented cost calculation across rate periods (walk-in)
   * - BR-09/10: Use locked rate for reservation sessions (no re-resolution)
   * - 14.3: Add overtime penalty when duration > threshold (default 24h)
   * - 14.4: Add lost ticket penalty when flagged
   * - 14.5: Read rates from PricingConfig (not hard-coded)
   * - 14.6: Apply reservation discount (20% off base fee) when session comes from a reservation
   *
   * @param session - The parking session (must have checkInTime)
   * @param isLost - Whether the ticket is lost
   * @param checkOutTime - Override check-out time (defaults to now)
   * @param hasReservationOverride - Explicit reservation flag override
   * @param lockedRate - For reservation sessions: the snapshotted hourly rate (BR-09)
   */
  async calculate(
    session: Pick<
      ParkingSession,
      'id' | 'vehicleType' | 'checkInTime' | 'checkOutTime' | 'vehicleId'
    > & { reservationId?: string | null },
    isLost: boolean = false,
    checkOutTime?: Date,
    hasReservationOverride?: boolean,
    lockedRate?: number | null,
  ): Promise<FeeBreakdown> {
    // 14.5: Read pricing config from DB (global settings)
    const pricing = await this.prisma.pricingConfig.findFirst({
      where: { vehicleType: session.vehicleType },
    });

    if (!pricing) {
      throw new NotFoundException(
        `PricingConfig not found for vehicle type: ${session.vehicleType}`,
      );
    }

    const effectiveCheckOut =
      checkOutTime ?? session.checkOutTime ?? new Date();

    const durationMs =
      effectiveCheckOut.getTime() - session.checkInTime.getTime();
    const durationHours = durationMs / (1000 * 60 * 60);

    let originalBaseFee: number;
    let hourlyRate: number;
    let roundedHours: number;

    if (lockedRate != null) {
      // BR-09/10: Reservation session — use locked rate, no segmentation
      hourlyRate = lockedRate;
      roundedHours = Math.ceil(durationHours);
      originalBaseFee = roundedHours * hourlyRate;
    } else {
      // BR-05: Walk-in — segmented cost calculation across rate periods
      const segmented = await this.resolver.calculateSegmentedCost(
        session.vehicleType,
        session.checkInTime,
        effectiveCheckOut,
      );
      hourlyRate = segmented.segments[0]?.rateTable.hourlyRate ?? 0;
      roundedHours = segmented.segments.reduce(
        (sum, seg) => sum + Math.ceil(seg.durationHours),
        0,
      );
      originalBaseFee = segmented.totalCost;
    }

    // Check for active subscription
    let isSubscriber = false;
    if (session.vehicleId) {
      const now = new Date();
      const activeSub = await this.prisma.subscription.findFirst({
        where: {
          vehicleId: session.vehicleId,
          status: 'active',
          validFrom: { lte: now },
          validTo: { gte: now },
        },
      });
      isSubscriber = !!activeSub;
    }

    const hasReservation = hasReservationOverride ?? !!session.reservationId;
    const discountPercent = pricing.reservationDiscountPercent ?? 20;

    // Apply reservation discount (waived for subscribers)
    const effectiveBaseFee = isSubscriber ? 0 : originalBaseFee;
    const reservationDiscountAmount =
      !isSubscriber && hasReservation && effectiveBaseFee > 0
        ? Math.round(effectiveBaseFee * (discountPercent / 100))
        : 0;
    const baseFee = effectiveBaseFee - reservationDiscountAmount;

    // 14.3: Overtime penalty when duration exceeds threshold
    const isOvertime = durationHours > pricing.overtimeThresholdHours;
    const overtimePenalty = isOvertime ? pricing.overtimePenalty : 0;

    // 14.4: Lost ticket penalty
    const lostTicketPenalty = isLost ? pricing.lostTicketPenalty : 0;

    const totalFee = baseFee + overtimePenalty + lostTicketPenalty;

    return {
      sessionId: session.id,
      vehicleType: session.vehicleType,
      checkInTime: session.checkInTime,
      checkOutTime: effectiveCheckOut,
      durationMs,
      durationHours,
      roundedHours,
      hourlyRate,
      originalBaseFee,
      reservationDiscountPercent: discountPercent,
      reservationDiscountAmount,
      baseFee,
      isOvertime,
      overtimePenalty,
      isLostTicket: isLost,
      lostTicketPenalty,
      totalFee,
      isSubscriber,
      hasReservation,
    };
  }

  /**
   * 14.6: Preview fee calculation for a session (Staff use).
   * Looks up the session by ID, calculates fee without persisting.
   */
  async preview(
    sessionId: string,
    isLost: boolean = false,
  ): Promise<FeeBreakdown> {
    const session = await this.prisma.parkingSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        vehicleType: true,
        vehicleId: true,
        reservationId: true,
        checkInTime: true,
        checkOutTime: true,
        status: true,
      },
    });

    if (!session) {
      throw new NotFoundException(`Session not found: ${sessionId}`);
    }

    return this.calculate(session, isLost);
  }
}
