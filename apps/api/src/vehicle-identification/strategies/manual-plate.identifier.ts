import { Injectable } from '@nestjs/common';
import type { IVehicleIdentifier } from '../vehicle-identifier.interface';
import type { VehicleIdentityResult } from '../vehicle-identity.types';

export interface ManualPlateInput {
  licensePlate: string;
  /** Optional OCR confidence when the plate came from the OCR camera rather than pure keyboard input. */
  confidence?: number;
  isOcr?: boolean;
}

/**
 * ManualPlateIdentifier
 *
 * Normalizes a license plate string provided by staff (typed manually or
 * auto-filled after an OCR scan). This is the simplest strategy: it only
 * formats and validates the input, produces no DB queries.
 *
 * Source: MANUAL_PLATE (typed) or OCR (scanned by camera + auto-filled).
 */
@Injectable()
export class ManualPlateIdentifier implements IVehicleIdentifier<ManualPlateInput> {
  readonly name = 'manual_plate';

  async identify(input: ManualPlateInput): Promise<VehicleIdentityResult | null> {
    const plate = input.licensePlate?.trim().toUpperCase();
    if (!plate) return null;

    return {
      source: input.isOcr ? 'OCR' : 'MANUAL_PLATE',
      licensePlate: plate,
      confidence: input.confidence,
      rawPayload: input,
    };
  }
}
