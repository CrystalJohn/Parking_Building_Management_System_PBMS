import { normalizeVehicleType, VEHICLE_TYPE_LABEL } from './vehicle-type'

describe('normalizeVehicleType', () => {
  // ── Motorbike family ──────────────────────────────────────────────────────
  it('maps "Motorbike" to MOTORBIKE', () => {
    expect(normalizeVehicleType('Motorbike')).toBe('MOTORBIKE')
  })

  it('maps "Motorcycle" to MOTORBIKE', () => {
    expect(normalizeVehicleType('Motorcycle')).toBe('MOTORBIKE')
  })

  it('maps "motorcycle" (lowercase) to MOTORBIKE', () => {
    expect(normalizeVehicleType('motorcycle')).toBe('MOTORBIKE')
  })

  it('maps "MOTORBIKE" (uppercase) to MOTORBIKE', () => {
    expect(normalizeVehicleType('MOTORBIKE')).toBe('MOTORBIKE')
  })

  it('maps "Bike" to MOTORBIKE', () => {
    expect(normalizeVehicleType('Bike')).toBe('MOTORBIKE')
  })

  it('maps "moto" to MOTORBIKE', () => {
    expect(normalizeVehicleType('moto')).toBe('MOTORBIKE')
  })

  // ── Car family ────────────────────────────────────────────────────────────
  it('maps "Car" to CAR', () => {
    expect(normalizeVehicleType('Car')).toBe('CAR')
  })

  it('maps "Sedan" to CAR', () => {
    expect(normalizeVehicleType('Sedan')).toBe('CAR')
  })

  it('maps "SUV" to CAR', () => {
    expect(normalizeVehicleType('SUV')).toBe('CAR')
  })

  it('maps "Hatchback" to CAR', () => {
    expect(normalizeVehicleType('Hatchback')).toBe('CAR')
  })

  it('maps "Pickup" to CAR', () => {
    expect(normalizeVehicleType('Pickup')).toBe('CAR')
  })

  // ── UNKNOWN / null / undefined ────────────────────────────────────────────
  it('maps null to UNKNOWN', () => {
    expect(normalizeVehicleType(null)).toBe('UNKNOWN')
  })

  it('maps undefined to UNKNOWN', () => {
    expect(normalizeVehicleType(undefined)).toBe('UNKNOWN')
  })

  it('maps empty string to UNKNOWN', () => {
    expect(normalizeVehicleType('')).toBe('UNKNOWN')
  })

  it('maps unrecognized string to UNKNOWN', () => {
    expect(normalizeVehicleType('Spaceship')).toBe('UNKNOWN')
  })

  // ── Cross-source equivalence (the key business requirement) ───────────────
  it('Motorbike and Motorcycle resolve to the same canonical type', () => {
    expect(normalizeVehicleType('Motorbike')).toBe(normalizeVehicleType('Motorcycle'))
  })

  it('motorcycle and MOTORBIKE resolve to the same canonical type', () => {
    expect(normalizeVehicleType('motorcycle')).toBe(normalizeVehicleType('MOTORBIKE'))
  })

  it('Car and Sedan resolve to the same canonical type', () => {
    expect(normalizeVehicleType('Car')).toBe(normalizeVehicleType('Sedan'))
  })

  it('Car and SUV resolve to the same canonical type', () => {
    expect(normalizeVehicleType('Car')).toBe(normalizeVehicleType('SUV'))
  })

  it('Car and Motorcycle do NOT resolve to the same canonical type', () => {
    expect(normalizeVehicleType('Car')).not.toBe(normalizeVehicleType('Motorcycle'))
  })
})

describe('VEHICLE_TYPE_LABEL', () => {
  it('provides human-friendly labels for all canonical types', () => {
    expect(VEHICLE_TYPE_LABEL.MOTORBIKE).toBe('Motorbike')
    expect(VEHICLE_TYPE_LABEL.CAR).toBe('Car')
    expect(VEHICLE_TYPE_LABEL.UNKNOWN).toBe('Unknown')
  })
})
