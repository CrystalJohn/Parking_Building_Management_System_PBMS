export const RESERVATION_CHECKIN_TOKEN_TYPE = 'reservation_checkin' as const;
export const RESERVATION_CHECKIN_TOKEN_TTL_SECONDS = 300;
export const RESERVATION_CHECKIN_TOKEN_REFRESH_MS = 270_000;

export interface ReservationCheckInTokenPayload {
  typ: typeof RESERVATION_CHECKIN_TOKEN_TYPE;
  reservationId: string;
  vehicleId: string;
  driverId: string;
}
