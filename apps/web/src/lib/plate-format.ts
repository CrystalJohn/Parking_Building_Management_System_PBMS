export function normalizePlateForApi(value: string | null | undefined): string {
  return (value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function formatDisplayPlate(raw: string | null | undefined): string {
  if (!raw) return ''
  const str = String(raw).trim().toUpperCase()

  // 1. Structured input with spaces, dashes, or newlines (e.g. '99-F1 7777', '99-F1\n7777', '99F1 7777', '99-F1-7777')
  const mbStructured4 = str.match(/^(\d{2})[- ]?([A-Z]\d|[A-Z]{2})[\n\- ]+(\d{4})$/)
  if (mbStructured4) {
    return `${mbStructured4[1]}-${mbStructured4[2]} ${mbStructured4[3]}`
  }

  const mbStructured5 = str.match(/^(\d{2})[- ]?([A-Z]\d|[A-Z]{2})[\n\- ]+(\d{3})[.]?(\d{2})$/)
  if (mbStructured5) {
    return `${mbStructured5[1]}-${mbStructured5[2]} ${mbStructured5[3]}.${mbStructured5[4]}`
  }

  const carStructured5 = str.match(/^(\d{2}[A-Z]{1,2})[\n\- ]+(\d{3})[.]?(\d{2})$/)
  if (carStructured5) {
    return `${carStructured5[1]}-${carStructured5[2]}.${carStructured5[3]}`
  }

  const carStructured4 = str.match(/^(\d{2}[A-Z])[\n\- ]+(\d{4})$/)
  if (carStructured4) {
    return `${carStructured4[1]}-${carStructured4[2]}`
  }

  // 2. Canonical clean
  const clean = normalizePlateForApi(raw)
  if (!clean) return ''

  // 2a. Length 9:
  if (clean.length === 9) {
    const carSpecial = clean.match(/^(\d{2}(?:LD|KT|DA|CD|NG|NN|CV))(\d{3})(\d{2})$/)
    if (carSpecial) {
      return `${carSpecial[1]}-${carSpecial[2]}.${carSpecial[3]}`
    }

    const mb5 = clean.match(/^(\d{2})([A-Z]\d|[A-Z]{2})(\d{3})(\d{2})$/)
    if (mb5 && !isCarSpecialSeries(mb5[2])) {
      return `${mb5[1]}-${mb5[2]} ${mb5[3]}.${mb5[4]}`
    }
  }

  // 2b. Length 8:
  if (clean.length === 8) {
    // Motorbike 4-digit old: 99-F1 7777, 99-E1 2226, 29-H1 1234, 59-AA 1234
    const mb4 = clean.match(/^(\d{2})([A-Z]\d|[A-Z]{2})(\d{4})$/)
    if (mb4 && !isCarSpecialSeries(mb4[2])) {
      return `${mb4[1]}-${mb4[2]} ${mb4[3]}`
    }

    // Car standard 5-digit: 30A-123.45, 51F-567.89, 60A-888.88
    const car5 = clean.match(/^(\d{2}[A-Z])(\d{3})(\d{2})$/)
    if (car5) {
      return `${car5[1]}-${car5[2]}.${car5[3]}`
    }
  }

  // 2c. Length 7:
  if (clean.length === 7) {
    const car4 = clean.match(/^(\d{2}[A-Z])(\d{4})$/)
    if (car4) {
      return `${car4[1]}-${car4[2]}`
    }
  }

  return clean
}

function isCarSpecialSeries(series: string): boolean {
  return /^(?:LD|KT|DA|CD|NG|NN|CV)$/i.test(series)
}

export const VIETNAMESE_PLATE_REGEX = /^(?:[0-9]{2}[A-Z]{1,2}[0-9]{4,5}|[0-9]{2}[A-Z][0-9][0-9]{4,5})$/

export function isValidVietnamesePlate(value: string | null | undefined): boolean {
  const normalized = normalizePlateForApi(value)
  if (!normalized) return false
  if (normalized.length < 6 || normalized.length > 9) return false
  return VIETNAMESE_PLATE_REGEX.test(normalized)
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
