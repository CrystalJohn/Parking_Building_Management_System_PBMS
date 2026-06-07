import type { ParkingSession } from '../types/api';

const FALLBACK_HOURLY_RATE = 10_000;

export function getSessionDurationMs(session: Pick<ParkingSession, 'checkInTime' | 'checkOutTime'>) {
  const start = new Date(session.checkInTime).getTime();
  const end = session.checkOutTime ? new Date(session.checkOutTime).getTime() : Date.now();

  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    return 0;
  }

  return end - start;
}

export function formatDuration(durationMs: number) {
  const totalMinutes = Math.max(0, Math.floor(durationMs / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes}m`;
  }

  return `${hours}h ${minutes}m`;
}

export function getEstimatedFee(session: ParkingSession) {
  const backendAmount = session.feeAmount + session.penaltyAmount;

  if (backendAmount > 0) {
    return {
      amount: backendAmount,
      source: 'backend' as const,
    };
  }

  const durationMs = getSessionDurationMs(session);
  const hours = Math.max(1, Math.ceil(durationMs / 3_600_000));

  return {
    amount: hours * FALLBACK_HOURLY_RATE,
    source: 'estimated' as const,
  };
}
