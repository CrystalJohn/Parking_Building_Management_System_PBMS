import type { VehicleIdentityResult } from './vehicle-identity.types';

/**
 * IVehicleIdentifier — common interface for all vehicle identification strategies.
 *
 * Responsibilities (ONLY):
 *   - Accept an input (plate string, QR payload, session code, etc.)
 *   - Return a normalized VehicleIdentityResult
 *
 * Must NOT:
 *   - Create parking sessions
 *   - Allocate slots
 *   - Fulfill reservations
 *   - Calculate fees
 *   - Process payments
 *   - Complete checkout
 */
export interface IVehicleIdentifier<TInput = unknown> {
  /** Strategy name — used for logging and audit. */
  readonly name: string;

  /**
   * Attempt to identify the vehicle from the given input.
   * Returns null if the input is insufficient or the strategy cannot handle it.
   * Throws only on unexpected/unrecoverable errors (e.g. external service failure).
   */
  identify(input: TInput): Promise<VehicleIdentityResult | null>;
}
