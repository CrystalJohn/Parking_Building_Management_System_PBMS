export function normalizePlateForApi(value: string | null | undefined): string {
  return (value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export const VIETNAMESE_PLATE_REGEX = /^(?:[0-9]{2}[A-Z][0-9]{5}|[0-9]{2}[A-Z][0-9]?[0-9]{5})$/

export function isValidVietnamesePlate(value: string | null | undefined): boolean {
  const normalized = normalizePlateForApi(value)
  if (!normalized) return false
  if (normalized.length < 7 || normalized.length > 9) return false
  return VIETNAMESE_PLATE_REGEX.test(normalized)
}

export function formatVietnamesePlateDisplay(value: string | null | undefined): string | null {
  const normalized = normalizePlateForApi(value)
  if (normalized.length === 8 && /^\d{2}[A-Z]\d{5}$/.test(normalized)) {
    return `${normalized.slice(0, 3)}-${normalized.slice(3, 6)}.${normalized.slice(6)}`
  }
  if (normalized.length === 9 && /^\d{2}[A-Z]\d{6}$/.test(normalized)) {
    return `${normalized.slice(0, 2)}-${normalized.slice(2, 4)} ${normalized.slice(4, 7)}.${normalized.slice(7)}`
  }
  return null
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
