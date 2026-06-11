import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { IVehicleIdentifier } from '../vehicle-identifier.interface';
import type { VehicleIdentityResult } from '../vehicle-identity.types';

export interface SessionQrInput {
  /** Session UUID decoded from the driver's parking session QR code. */
  sessionId: string;
}

/**
 * SessionQrIdentifier
 *
 * Resolves a session UUID (scanned from the driver's QR) to a normalized
 * VehicleIdentityResult. Performs a lightweight DB lookup to confirm the
 * session exists and is still active.
 *
 * Responsibility: Identification ONLY.
 * Does NOT calculate fees, complete checkout, or process payments.
 * The caller (SessionsService) decides what to do with the result.
 *
 * Returns null if the session is not found or is not active.
 */
@Injectable()
export class SessionQrIdentifier implements IVehicleIdentifier<SessionQrInput> {
  readonly name = 'session_qr';

  constructor(private readonly prisma: PrismaService) {}

  async identify(input: SessionQrInput): Promise<VehicleIdentityResult | null> {
    const sessionId = input.sessionId?.trim();
    if (!sessionId) return null;

    const session = await this.prisma.parkingSession.findUnique({
      where: { id: sessionId },
      select: { id: true, status: true, licensePlate: true },
    });

    if (!session || session.status !== 'active') {
      return null;
    }

    return {
      source: 'SESSION_QR',
      sessionId: session.id,
      licensePlate: session.licensePlate,
      rawPayload: input,
    };
  }
}
