export function normalizePlateForApi(value: string | null | undefined): string {
  return (value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function formatPlateForDisplay(value: string | null | undefined): string {
  const raw = (value ?? '').trim().toUpperCase()
  const normalized = normalizePlateForApi(value)

  if (!normalized) {
    return ''
  }

  if (/^\d{2}[A-Z]\d{5}$/.test(normalized)) {
    return `${normalized.slice(0, 3)}-${normalized.slice(3, 6)}.${normalized.slice(6)}`
  }

  if (/^\d{2}[A-Z]\d\d{5}$/.test(normalized)) {
    return `${normalized.slice(0, 4)}-${normalized.slice(4, 7)}.${normalized.slice(7)}`
  }

  if (/[.\-\s]/.test(raw)) {
    return raw
  }

  return normalized
}
