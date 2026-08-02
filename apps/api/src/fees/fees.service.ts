import { Injectable, NotFoundException } from '@nestjs/common';
import { ParkingSession, VehicleType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

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
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 14.1: Calculate fee for a parking session.
   *
   * Logic:
   * - 14.2: Round up duration to next full hour (Math.ceil)
   * - 14.3: Add overtime penalty when duration > threshold (default 24h)
   * - 14.4: Add lost ticket penalty when flagged
   * - 14.5: Read rates from PricingConfig (not hard-coded)
   * - 14.6: Apply reservation discount (20% off base fee) when session comes from a reservation
   *
   * @param session - The parking session (must have checkInTime)
   * @param isLost - Whether the ticket is lost
   * @param checkOutTime - Override check-out time (defaults to now)
   * @param hasReservationOverride - Explicit reservation flag override
   */
  async calculate(
    session: Pick<
      ParkingSession,
      'id' | 'vehicleType' | 'checkInTime' | 'checkOutTime' | 'vehicleId'
    > & { reservationId?: string | null },
    isLost: boolean = false,
    checkOutTime?: Date,
    hasReservationOverride?: boolean,
  ): Promise<FeeBreakdown> {
    // 14.5: Read pricing config from DB
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

    // Calculate duration and rounded hours
    const durationMs =
      effectiveCheckOut.getTime() - session.checkInTime.getTime();
    const durationMinutes = Math.floor(durationMs / 60000);
    const durationHours = durationMs / (1000 * 60 * 60);
    const roundedHours = Math.ceil(durationHours);

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
    let discountPercent = pricing.reservationDiscountPercent ?? 20;
    let hourlyRateBase = pricing.hourlyRate;
    let hourlyRateDiscounted = Math.round(
      pricing.hourlyRate * (1 - discountPercent / 100),
    );

    // Chốt mức giá từ thời điểm đặt trước (nếu có reservationId)
    if (hasReservation && session.reservationId) {
      const lockedRes = await this.prisma.reservation.findUnique({
        where: { id: session.reservationId },
        select: { depositAmount: true },
      });
      if (lockedRes && lockedRes.depositAmount > 0) {
        hourlyRateDiscounted = lockedRes.depositAmount;
        hourlyRateBase = Math.round(
          lockedRes.depositAmount / (1 - discountPercent / 100),
        );
      }
    }

    const originalBaseFee = isSubscriber ? 0 : roundedHours * hourlyRateBase;
    let baseFee = 0;
    let reservationDiscountAmount = 0;

    if (isSubscriber) {
      baseFee = 0;
      reservationDiscountAmount = 0;
    } else if (hasReservation) {
      // Pre-booked driver: 1st hour is covered by deposit (waived at checkout)
      // Remaining hours are charged at the locked discounted hourly rate
      const billableHours = Math.max(0, roundedHours - 1);
      baseFee = billableHours * hourlyRateDiscounted;
      reservationDiscountAmount = originalBaseFee - baseFee;
    } else {
      // Walk-in driver: 10-minute Grace Exit is free (0 VNĐ)
      if (durationMinutes <= 10) {
        baseFee = 0;
      } else {
        baseFee = roundedHours * hourlyRateBase;
      }
      reservationDiscountAmount = 0;
    }

    // Overtime penalty when duration exceeds threshold
    const isOvertime = durationHours > pricing.overtimeThresholdHours;
    const overtimePenalty = isOvertime ? pricing.overtimePenalty : 0;

    // Lost ticket penalty
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
      hourlyRate: hasReservation ? hourlyRateDiscounted : hourlyRateBase,
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
