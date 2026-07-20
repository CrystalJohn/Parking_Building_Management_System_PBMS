import { isAxiosError } from 'axios'

export type ReservationQrBadgeLabel = 'Invalid QR' | 'QR expired' | 'Camera unavailable'

export type NormalizedReservationQrError = {
  badgeLabel: ReservationQrBadgeLabel
  message: string
}


export function normalizeReservationQrError(error: unknown): NormalizedReservationQrError {
  const message = extractMessage(error)
  const normalized = message.toLowerCase()

  let badgeLabel: ReservationQrBadgeLabel = 'Invalid QR'

  if (normalized.includes('camera')) badgeLabel = 'Camera unavailable'
  if (normalized.includes('expired')) badgeLabel = 'QR expired'

  const finalMessage = message.trim() || 'Unable to load reservation QR. Use OCR fallback or scan again.'

  return {
    badgeLabel,
    message: finalMessage,
  }
}

export function normalizeReservationPaymentBadge(value: string): 'Paid' | 'Auto-pay' | 'Pay on exit' {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'paid') return 'Paid'
  if (normalized === 'auto-pay') return 'Auto-pay'
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
