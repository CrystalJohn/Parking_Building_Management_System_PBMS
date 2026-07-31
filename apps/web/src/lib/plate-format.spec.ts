import {
  normalizePlateForApi,
  isValidVietnamesePlate,
  formatPlateForDisplay,
  formatVehicleType,
} from './plate-format'

describe('normalizePlateForApi', () => {
  it('removes dashes, dots, spaces and lowercases', () => {
    expect(normalizePlateForApi('30A-123.45')).toBe('30A12345')
    expect(normalizePlateForApi(' 59X3 456.78 ')).toBe('59X345678')
    expect(normalizePlateForApi('29k6-447.43')).toBe('29K644743')
  })

  it('returns empty string for null/undefined input', () => {
    expect(normalizePlateForApi(null)).toBe('')
    expect(normalizePlateForApi(undefined)).toBe('')
  })
})

describe('isValidVietnamesePlate', () => {
  it('accepts valid car plates (8 chars)', () => {
    expect(isValidVietnamesePlate('30A12345')).toBe(true)
    expect(isValidVietnamesePlate('51K99999')).toBe(true)
    expect(isValidVietnamesePlate('30A-123.45')).toBe(true)
  })

  it('accepts valid motorcycle plates (9 chars)', () => {
    expect(isValidVietnamesePlate('59X345678')).toBe(true)
    expect(isValidVietnamesePlate('29K644743')).toBe(true)
    expect(isValidVietnamesePlate('59X3-456.78')).toBe(true)
  })

  it('rejects invalid plates', () => {
    expect(isValidVietnamesePlate('ABC')).toBe(false)
    expect(isValidVietnamesePlate('12345')).toBe(false)
    expect(isValidVietnamesePlate('30A12345')).toBe(true) // 8 chars - valid car plate
    expect(isValidVietnamesePlate('30A123456')).toBe(true) // 9 chars - valid motorcycle plate
    expect(isValidVietnamesePlate('30A1234567')).toBe(false) // 10 chars - too long
    expect(isValidVietnamesePlate('3A12345')).toBe(false) // only 1 province digit
    expect(isValidVietnamesePlate('30A12')).toBe(false) // too short (7 chars but wrong structure)
    expect(isValidVietnamesePlate('')).toBe(false)
    expect(isValidVietnamesePlate(null)).toBe(false)
  })
})

describe('formatPlateForDisplay', () => {
  it('formats car plates as XX-XXX.XX', () => {
    expect(formatPlateForDisplay('30A12345')).toBe('30A-123.45')
    expect(formatPlateForDisplay('51K99999')).toBe('51K-999.99')
  })

  it('formats motorcycle plates as XXS-N-XXX.XX', () => {
    expect(formatPlateForDisplay('59X345678')).toBe('59X3-456.78')
    expect(formatPlateForDisplay('29K644743')).toBe('29K6-447.43')
  })

  it('handles pre-formatted input gracefully', () => {
    expect(formatPlateForDisplay('30A-123.45')).toBe('30A-123.45')
    expect(formatPlateForDisplay('59X3-456.78')).toBe('59X3-456.78')
  })

  it('returns empty string for empty input', () => {
    expect(formatPlateForDisplay('')).toBe('')
    expect(formatPlateForDisplay(null)).toBe('')
    expect(formatPlateForDisplay(undefined)).toBe('')
  })

  it('returns normalized form for unrecognized patterns', () => {
    expect(formatPlateForDisplay('ABC')).toBe('ABC')
  })
})

describe('formatVehicleType', () => {
  it('capitalizes vehicle type', () => {
    expect(formatVehicleType('car')).toBe('Car')
    expect(formatVehicleType('motorbike')).toBe('Motorbike')
  })

  it('returns empty string for null/undefined', () => {
    expect(formatVehicleType(null)).toBe('')
    expect(formatVehicleType(undefined)).toBe('')
  })
})
