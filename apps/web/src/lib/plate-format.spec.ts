import {
  normalizePlateForApi,
  isValidVietnamesePlate,
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
