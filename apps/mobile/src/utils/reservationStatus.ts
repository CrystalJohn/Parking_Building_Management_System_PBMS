import type { ReservationStatus } from '../types/api';

const validReservationStatuses: ReservationStatus[] = [
  'active',
  'fulfilled',
  'expired',
  'cancelled',
];

export function normalizeReservationStatus(status?: string | null): ReservationStatus | 'unknown' {
  const normalized = status?.toLowerCase();
  if (validReservationStatuses.includes(normalized as ReservationStatus)) {
    return normalized as ReservationStatus;
  }

  return 'unknown';
}

export function canCancelReservation(status?: string | null) {
  return normalizeReservationStatus(status) === 'active';
}

export function getReservationStatusLabel(status?: string | null) {
  const normalized = normalizeReservationStatus(status);

  switch (normalized) {
    case 'active':
      return 'Active';
    case 'fulfilled':
      return 'Fulfilled / checked in';
    case 'cancelled':
      return 'Cancelled';
    case 'expired':
      return 'Expired';
    default:
      return status ?? 'Unknown';
  }
}
