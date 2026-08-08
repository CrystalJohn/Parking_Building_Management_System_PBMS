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
  timeSlotName?: string;
  depositCredited?: number;
}

@Injectable()
export class FeesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper: Determine time-of-day slot name (Sáng, Trưa/Chiều, Tối/Đêm)
   */
  getTimeSlotName(date: Date): string {
    const hour = date.getHours();
    if (hour >= 6 && hour < 12) return 'Morning (Sáng 06:00 - 12:00)';
    if (hour >= 12 && hour < 18) return 'Afternoon (Trưa/Chiều 12:00 - 18:00)';
    return 'Night (Tối/Đêm 18:00 - 06:00)';
  }

  /**
   * Helper: Dynamic Time-of-day / Event Multiplier
   */
  getTimeSlotMultiplier(date: Date): number {
    const day = date.getDay(); // 0 = Sunday, 6 = Saturday
    const hour = date.getHours();
    
    // Weekend / Holiday slight adjustment or standard
    if (day === 0 || day === 6) {
      return 1.0;
    }
    // Peak business afternoon
    if (hour >= 12 && hour < 18) {
      return 1.0;
    }
    return 1.0;
  }

  /**
   * 14.1: Calculate fee for a parking session with dynamic time-of-day rates
   * and permanent price locking for pre-booked reservations.
   */
  async calculate(
    session: Pick<
      ParkingSession,
      'id' | 'vehicleType' | 'checkInTime' | 'checkOutTime' | 'vehicleId'
    > & { reservationId?: string | null; lockedHourlyRate?: number | null },
    isLost: boolean = false,
    checkOutTime?: Date,
    hasReservationOverride?: boolean,
  ): Promise<FeeBreakdown> {
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
    // Walk-in sessions: use the hourly rate that was locked at check-in time.
    // This prevents price changes from affecting already-parked vehicles.
    let hourlyRateBase = (!hasReservation && session.lockedHourlyRate != null)
      ? session.lockedHourlyRate
      : pricing.hourlyRate;
    let hourlyRateDiscounted = Math.round(
      hourlyRateBase * (1 - discountPercent / 100),
    );
    let depositCredited = 0;

    // Chốt mức giá từ thời điểm đặt trước (vĩnh viễn không đổi khi checkout)
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
        depositCredited = lockedRes.depositAmount;
      }
    }

    const timeSlotName = this.getTimeSlotName(session.checkInTime);
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
      timeSlotName,
      depositCredited,
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
        lockedHourlyRate: true,
      },
    });

    if (!session) {
      throw new NotFoundException(`Session not found: ${sessionId}`);
    }

    return this.calculate(session, isLost);
  }
}
