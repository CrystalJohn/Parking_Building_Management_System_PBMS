/**
 * Vehicle Identification Types
 *
 * Defines the normalized result shape returned by all identification strategies.
 * Business services (SessionsService, ReservationsService) consume this result
 * and must NOT perform identification themselves.
 */

// ─── Source enum ─────────────────────────────────────────────────────────────

export type VehicleIdentitySource =
  | 'OCR'
  | 'RESERVATION_QR'
  | 'SESSION_QR'
  | 'MANUAL_PLATE'
  | 'MANUAL_SESSION_CODE';

// ─── Normalized result ───────────────────────────────────────────────────────

/**
 * The normalized output produced by any VehicleIdentifier strategy.
 * Consumers should use `source` to understand how identification was achieved.
 */
export interface VehicleIdentityResult {
  /** Which strategy produced this result. */
  source: VehicleIdentitySource;
  /** Normalized license plate (uppercase, formatted). Present for PLATE-based sources. */
  licensePlate?: string;
  /** Reservation UUID. Present when source is RESERVATION_QR. */
  reservationId?: string;
  /** Parking session UUID. Present when source is SESSION_QR or MANUAL_SESSION_CODE. */
  sessionId?: string;
  /** OCR confidence score (0..1). Present when source is OCR. */
  confidence?: number;
  /** Raw input payload before normalization. Useful for debugging. */
  rawPayload?: unknown;
}

// ─── Input types per flow ────────────────────────────────────────────────────

/**
 * All possible inputs staff can supply during check-in.
 * VehicleIdentificationService.identifyForCheckIn() maps this to VehicleIdentityResult.
 */
export interface CheckInIdentityInput {
  /** Plate string from OCR or manual entry. */
  licensePlate?: string;
  /** Reservation UUID decoded from a QR code. */
  reservationId?: string;
  /** Phone number of the registered driver (used for reservation lookup fallback). */
  driverPhone?: string;
  /** OCR confidence (0..1) — forwarded for audit when source is OCR. */
  identificationConfidence?: number;
}

/**
 * All possible inputs staff can supply during checkout.
 * VehicleIdentificationService.identifyForCheckout() maps this to VehicleIdentityResult.
 */
export interface CheckOutIdentityInput {
  /** Session UUID from QR scan or manual session code entry. */
  sessionId?: string;
  /** Plate string from manual entry or OCR fallback. */
  licensePlate?: string;
}
