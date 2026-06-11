import { BadRequestException, Injectable } from '@nestjs/common';
import type { VehicleIdentityResult, CheckInIdentityInput, CheckOutIdentityInput } from './vehicle-identity.types';
import { ManualPlateIdentifier } from './strategies/manual-plate.identifier';
import { ReservationQrIdentifier } from './strategies/reservation-qr.identifier';
import { SessionQrIdentifier } from './strategies/session-qr.identifier';
import { ManualSessionCodeIdentifier } from './strategies/manual-session-code.identifier';

/**
 * VehicleIdentificationService
 *
 * Orchestrates the identification strategy chain for check-in and checkout.
 * This service is the single point of responsibility for turning raw staff
 * inputs into a normalized VehicleIdentityResult.
 *
 * All business logic (session creation, slot allocation, fee calculation, etc.)
 * stays in SessionsService. This service only identifies.
 *
 * Check-in chain:
 *   1. RESERVATION_QR  — if dto.reservationId is provided
 *   2. OCR / MANUAL_PLATE — if dto.licensePlate is provided
 *   (driverPhone is passed through as metadata, not an identification method)
 *
 * Checkout chain:
 *   1. SESSION_QR      — if dto.sessionId is provided
 *   2. MANUAL_SESSION_CODE — same field, different declared source
 *   3. LICENSE_PLATE   — if dto.licensePlate is provided
 */
@Injectable()
export class VehicleIdentificationService {
  constructor(
    private readonly manualPlateIdentifier: ManualPlateIdentifier,
    private readonly reservationQrIdentifier: ReservationQrIdentifier,
    private readonly sessionQrIdentifier: SessionQrIdentifier,
    private readonly manualSessionCodeIdentifier: ManualSessionCodeIdentifier,
  ) {}

  /**
   * Identify the vehicle for check-in using the declared fallback chain.
   *
   * Chain:
   *   1. RESERVATION_QR  (if reservationId present)
   *   2. OCR             (if licensePlate present + confidence provided)
   *   3. MANUAL_PLATE    (if licensePlate present, no confidence)
   *
   * @throws BadRequestException when no usable input is present.
   */
  async identifyForCheckIn(input: CheckInIdentityInput): Promise<VehicleIdentityResult> {
    // Step 1: Reservation QR — most deterministic, highest priority
    if (input.reservationId) {
      const result = await this.reservationQrIdentifier.identify({
        reservationId: input.reservationId,
      });
      if (result) {
        // Carry the license plate through if also provided (belt + suspenders)
        if (input.licensePlate) {
          result.licensePlate = input.licensePlate.trim().toUpperCase();
        }
        return result;
      }
      // Reservation not found or not active — fall through to plate-based identification
    }

    // Step 2 & 3: OCR or Manual plate
    if (input.licensePlate) {
      const result = await this.manualPlateIdentifier.identify({
        licensePlate: input.licensePlate,
        isOcr: input.identificationConfidence !== undefined,
        confidence: input.identificationConfidence,
      });
      if (result) return result;
    }

    throw new BadRequestException(
      'Check-in requires either a reservation QR code or a license plate.',
    );
  }

  /**
   * Identify the session for checkout using the declared fallback chain.
   *
   * Chain:
   *   1. SESSION_QR / MANUAL_SESSION_CODE  (if sessionId present)
   *   2. LICENSE_PLATE                     (if licensePlate present)
   *
   * The distinction between SESSION_QR and MANUAL_SESSION_CODE is determined
   * by whether the caller passes `identificationMethod` in the DTO. Since both
   * map to a sessionId, we use SESSION_QR as the default for sessionId input
   * and let callers override via the DTO field.
   *
   * @throws BadRequestException when no usable input is present.
   */
  async identifyForCheckout(input: CheckOutIdentityInput): Promise<VehicleIdentityResult> {
    // Step 1: Session QR or manual session code
    if (input.sessionId) {
      const result = await this.sessionQrIdentifier.identify({
        sessionId: input.sessionId,
      });
      if (result) return result;
      // Session not found or not active — fall through
    }

    // Step 2: License plate fallback
    if (input.licensePlate) {
      const result = await this.manualPlateIdentifier.identify({
        licensePlate: input.licensePlate,
        isOcr: false,
      });
      if (result) {
        // Override source to LICENSE_PLATE for checkout semantics
        result.source = 'MANUAL_PLATE';
        return result;
      }
    }

    throw new BadRequestException(
      'Checkout requires either a session ID (from QR) or a license plate.',
    );
  }
}
