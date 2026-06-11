import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { IVehicleIdentifier } from '../vehicle-identifier.interface';
import type { VehicleIdentityResult } from '../vehicle-identity.types';

export interface ReservationQrInput {
  /** Reservation UUID decoded from the driver's reservation QR code. */
  reservationId: string;
}

/**
 * ReservationQrIdentifier
 *
 * Resolves a reservation UUID (scanned from the driver's QR) to a normalized
 * VehicleIdentityResult. Performs a lightweight DB lookup to confirm the
 * reservation exists and is still active.
 *
 * Responsibility: Identification ONLY.
 * Does NOT fulfill the reservation, update slot status, or create sessions.
 * The caller (SessionsService) decides what to do with the result.
 *
 * Returns null if the reservation is not found or already expired/cancelled.
 */
@Injectable()
export class ReservationQrIdentifier implements IVehicleIdentifier<ReservationQrInput> {
  readonly name = 'reservation_qr';

  constructor(private readonly prisma: PrismaService) {}

  async identify(input: ReservationQrInput): Promise<VehicleIdentityResult | null> {
    const reservationId = input.reservationId?.trim();
    if (!reservationId) return null;

    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      select: { id: true, status: true },
    });

    if (!reservation || reservation.status !== 'active') {
      return null;
    }

    return {
      source: 'RESERVATION_QR',
      reservationId: reservation.id,
      rawPayload: input,
    };
  }
}
