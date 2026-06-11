import { Injectable } from '@nestjs/common';
import type { IVehicleIdentifier } from '../vehicle-identifier.interface';
import type { VehicleIdentityResult } from '../vehicle-identity.types';

export interface ManualSessionCodeInput {
  /** Session UUID entered manually by staff when QR scan is unavailable. */
  sessionId: string;
}

/**
 * ManualSessionCodeIdentifier
 *
 * Handles the case where the QR code cannot be scanned (damaged, no phone, etc.)
 * and staff manually types the session UUID from the parking ticket.
 *
 * Responsibility: Identification ONLY.
 * Normalizes the input without DB queries — the session lookup itself is
 * the responsibility of SessionsService (business logic).
 *
 * Source: MANUAL_SESSION_CODE
 */
@Injectable()
export class ManualSessionCodeIdentifier implements IVehicleIdentifier<ManualSessionCodeInput> {
  readonly name = 'manual_session_code';

  async identify(input: ManualSessionCodeInput): Promise<VehicleIdentityResult | null> {
    const sessionId = input.sessionId?.trim();
    if (!sessionId) return null;

    return {
      source: 'MANUAL_SESSION_CODE',
      sessionId,
      rawPayload: input,
    };
  }
}
