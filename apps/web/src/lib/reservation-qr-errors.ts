import { isAxiosError } from 'axios'

export type ReservationQrBadgeLabel = 'Invalid QR' | 'QR expired' | 'Camera unavailable'

export type NormalizedReservationQrError = {
  badgeLabel: ReservationQrBadgeLabel
  message: string
}

const DEFAULT_ERROR: NormalizedReservationQrError = {
  badgeLabel: 'Invalid QR',
  message: 'Unable to load reservation QR. Use OCR fallback or scan again.',
}

export function normalizeReservationQrError(error: unknown): NormalizedReservationQrError {
  const message = extractMessage(error)
  const normalized = message.toLowerCase()

  if (normalized.includes('camera')) {
    return {
      badgeLabel: 'Camera unavailable',
      message: 'Camera unavailable. Check browser permission or use OCR fallback.',
    }
  }

  if (
    normalized.includes('expired') ||
    normalized.includes('het han') ||
    normalized.includes('hết hạn')
  ) {
    return {
      badgeLabel: 'QR expired',
      message: 'Reservation QR expired. Ask the driver to refresh the QR or use OCR fallback.',
    }
  }

  if (
    normalized.includes('not active') ||
    normalized.includes('already checked in') ||
    normalized.includes('fulfilled') ||
    normalized.includes('cancelled')
  ) {
    return {
      badgeLabel: 'Invalid QR',
      message: 'Reservation is not active. Use OCR fallback.',
    }
  }

  if (
    normalized.includes('slot is no longer available') ||
    normalized.includes('reserved slot') ||
    normalized.includes('slot no longer')
  ) {
    return {
      badgeLabel: 'Invalid QR',
      message: 'Reserved slot is no longer available. Use OCR fallback.',
    }
  }

  if (normalized.includes('active parking session')) {
    return {
      badgeLabel: 'Invalid QR',
      message: message || DEFAULT_ERROR.message,
    }
  }

  if (
    normalized.includes('no linked vehicle') ||
    normalized.includes('linked vehicle') ||
    normalized.includes('vehicle')
  ) {
    return {
      badgeLabel: 'Invalid QR',
      message: 'Reservation has no linked vehicle. Use OCR fallback.',
    }
  }

  if (
    normalized.includes('not found') ||
    normalized.includes('invalid reservation qr') ||
    normalized.includes('khong hop le') ||
    normalized.includes('không hợp lệ')
  ) {
    return {
      badgeLabel: 'Invalid QR',
      message: 'Invalid reservation QR. Use OCR fallback or scan again.',
    }
  }

  return DEFAULT_ERROR
}

export function normalizeReservationPaymentBadge(value: string): 'Paid' | 'Auto-pay' | 'Pay on exit' {
  const normalized = value.trim().toLowerCase()

  if (normalized === 'paid' || normalized === 'đã thanh toán') {
    return 'Paid'
  }

  if (normalized === 'auto-pay') {
    return 'Auto-pay'
  }

  if (normalized === 'pay on exit' || normalized === 'thanh toán khi ra') {
    return 'Pay on exit'
  }

  return 'Pay on exit'
}

function extractMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const raw = error.response?.data?.message
    if (Array.isArray(raw)) return raw.join(', ')
    if (typeof raw === 'string') return raw
    return `Request failed (${error.response?.status ?? 'network'})`
  }

  if (error instanceof Error) return error.message
  return ''
}
