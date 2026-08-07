/**
 * Canonical vehicle type values used for internal comparison.
 * These are the only values the verification logic should operate on.
 */
export type CanonicalVehicleType = 'MOTORBIKE' | 'CAR' | 'UNKNOWN'

/**
 * Human-friendly display labels for canonical types.
 */
export const VEHICLE_TYPE_LABEL: Record<CanonicalVehicleType, string> = {
  MOTORBIKE: 'Motorbike',
  CAR: 'Car',
  UNKNOWN: 'Unknown',
}

/**
 * Maps raw vehicleType strings (from OCR evidence, scan detection, or API)
 * to a canonical CanonicalVehicleType for reliable comparison.
 *
 * Case-insensitive. Falls back to 'UNKNOWN' for unrecognized values.
 *
 * Examples:
 *   "Motorbike"  → "MOTORBIKE"
 *   "Motorcycle" → "MOTORBIKE"
 *   "Car"        → "CAR"
 *   "SUV"        → "CAR"
 *   null         → "UNKNOWN"
 */
export function normalizeVehicleType(raw: string | null | undefined): CanonicalVehicleType {
  if (!raw) return 'UNKNOWN'

  switch (raw.trim().toLowerCase()) {
    case 'motorbike':
    case 'motorcycle':
    case 'bike':
    case 'moto':
    case 'motor':
      return 'MOTORBIKE'

    case 'car':
    case 'sedan':
    case 'suv':
    case 'hatchback':
    case 'pickup':
    case 'truck':
    case 'van':
      return 'CAR'

    default:
      return 'UNKNOWN'
  }
}
