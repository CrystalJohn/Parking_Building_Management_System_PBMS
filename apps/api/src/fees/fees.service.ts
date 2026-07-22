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
  baseFee: number;
  isOvertime: boolean;
  overtimePenalty: number;
  isLostTicket: boolean;
  lostTicketPenalty: number;
  totalFee: number;
  isSubscriber: boolean;
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
   *
   * @param session - The parking session (must have checkInTime)
   * @param isLost - Whether the ticket is lost
   * @param checkOutTime - Override check-out time (defaults to now)
   */
  async calculate(
    session: Pick<
      ParkingSession,
      'id' | 'vehicleType' | 'checkInTime' | 'checkOutTime' | 'vehicleId'
    >,
    isLost: boolean = false,
    checkOutTime?: Date,
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

    // 14.2: Calculate duration and round up to full hours
    const durationMs =
      effectiveCheckOut.getTime() - session.checkInTime.getTime();
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

    // Base fee = rounded hours * hourly rate (waived for subscribers)
    const baseFee = isSubscriber ? 0 : roundedHours * pricing.hourlyRate;

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
      hourlyRate: pricing.hourlyRate,
      baseFee,
      isOvertime,
      overtimePenalty,
      isLostTicket: isLost,
      lostTicketPenalty,
      totalFee,
      isSubscriber,
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
