import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
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
 * Returns null ONLY when no reservationId is provided (empty input).
 *
 * IMPORTANT — business contract:
 *   When a reservationId IS provided, this identifier is authoritative.
 *   - If the reservation does not exist → throws NotFoundException (404)
 *   - If the reservation exists but is not active (expired, cancelled,
 *     fulfilled, etc.) → throws ConflictException (409)
 *   It MUST NOT return null and allow the caller to fall back to walk-in
 *   check-in. That silent fallback violates the reservation identity contract.
 */
@Injectable()
export class ReservationQrIdentifier implements IVehicleIdentifier<ReservationQrInput> {
  readonly name = 'reservation_qr';

  constructor(private readonly prisma: PrismaService) {}

  async identify(input: ReservationQrInput): Promise<VehicleIdentityResult | null> {
    const reservationId = input.reservationId?.trim();
    // Empty input → this strategy does not apply; caller may try another.
    if (!reservationId) return null;

    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      select: { id: true, status: true },
    });

    if (!reservation) {
      throw new NotFoundException(
        `Reservation ${reservationId} not found`,
      );
    }

    if (reservation.status !== 'active') {
      throw new ConflictException(
        `Reservation ${reservationId} is ${reservation.status} and cannot be checked in`,
      );
    }

    return {
      source: 'RESERVATION_QR',
      reservationId: reservation.id,
      rawPayload: input,
    };
  }
}
