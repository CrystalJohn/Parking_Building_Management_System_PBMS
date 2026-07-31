export function normalizePlateForApi(value: string | null | undefined): string {
  return (value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export const CAR_PLATE_REGEX = /^\d{2}[A-Z]\d{5}$/
export const MOTORCYCLE_PLATE_REGEX = /^\d{2}[A-Z]\d\d{5}$/
export const VIETNAMESE_PLATE_REGEX = /^(?:[0-9]{2}[A-Z][0-9]{5}|[0-9]{2}[A-Z][0-9]?[0-9]{5})$/

export function isValidVietnamesePlate(value: string | null | undefined): boolean {
  const normalized = normalizePlateForApi(value)
  if (!normalized) return false
  if (normalized.length < 7 || normalized.length > 9) return false
  return VIETNAMESE_PLATE_REGEX.test(normalized)
}

const CAR_PLATE_REGEX_LOCAL = /^\d{2}[A-Z]\d{5}$/
const MOTORCYCLE_PLATE_REGEX_LOCAL = /^\d{2}[A-Z]\d\d{5}$/

export function formatPlateForDisplay(value: string | null | undefined): string {
  const raw = (value ?? '').trim().toUpperCase()
  const normalized = normalizePlateForApi(value)

  if (!normalized) {
    return ''
  }

  if (CAR_PLATE_REGEX_LOCAL.test(normalized)) {
    return `${normalized.slice(0, 3)}-${normalized.slice(3, 6)}.${normalized.slice(6)}`
  }

  if (MOTORCYCLE_PLATE_REGEX_LOCAL.test(normalized)) {
    const province = normalized.slice(0, 2)
    const series = normalized.slice(2, 3)
    const seriesNumber = normalized.slice(3, 4)
    const numberPart = normalized.slice(4)
    return `${province}${series}${seriesNumber}-${numberPart.slice(0, 3)}.${numberPart.slice(3)}`
  }

  if (/[.\-\s]/.test(raw)) {
    return raw
  }

  return normalized
}

export function formatVehicleType(value: string | null | undefined): string {
  if (!value) return ''
  const str = value.trim()
  if (!str) return ''
  const lower = str.toLowerCase()
  if (lower === 'car') return 'Car'
  if (lower === 'motorbike' || lower === 'motobike' || lower === 'bike') return 'Motorbike'
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}
