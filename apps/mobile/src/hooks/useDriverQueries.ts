import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { driverApi } from '../api/driver';
import type { VehicleType } from '../types/api';

export const driverQueryKeys = {
  availability: ['driver', 'availability'] as const,
  reservations: ['driver', 'reservations'] as const,
  activeSessions: ['driver', 'active-sessions'] as const,
  history: ['driver', 'history'] as const,
  qrCode: (sessionId: string) => ['driver', 'qr-code', sessionId] as const,
};

export function useSlotAvailabilityQuery() {
  return useQuery({
    queryKey: driverQueryKeys.availability,
    queryFn: driverApi.getSlotAvailability,
  });
}

export function useReservationsQuery() {
  return useQuery({
    queryKey: driverQueryKeys.reservations,
    queryFn: driverApi.getMyReservations,
  });
}

export function useReservationDetailQuery(reservationId: string) {
  const reservationsQuery = useReservationsQuery();

  return {
    ...reservationsQuery,
    data: reservationsQuery.data?.find((reservation) => reservation.id === reservationId),
  };
}

export function useCreateReservationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (vehicleType: VehicleType) => driverApi.createReservation(vehicleType),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: driverQueryKeys.reservations });
      queryClient.invalidateQueries({ queryKey: driverQueryKeys.availability });
    },
  });
}

export function useCancelReservationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (reservationId: string) => driverApi.cancelReservation(reservationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: driverQueryKeys.reservations });
      queryClient.invalidateQueries({ queryKey: driverQueryKeys.availability });
    },
  });
}

export function useActiveSessionsQuery() {
  return useQuery({
    queryKey: driverQueryKeys.activeSessions,
    queryFn: driverApi.getActiveSessions,
  });
}

export function useActiveSessionQuery(sessionId?: string) {
  const activeSessionsQuery = useActiveSessionsQuery();

  return {
    ...activeSessionsQuery,
    data: sessionId
      ? activeSessionsQuery.data?.find((session) => session.id === sessionId)
      : activeSessionsQuery.data?.[0],
  };
}

export function useParkingHistoryQuery() {
  return useQuery({
    queryKey: driverQueryKeys.history,
    queryFn: driverApi.getParkingHistory,
  });
}

export function useQrCodeQuery(sessionId: string) {
  return useQuery({
    queryKey: driverQueryKeys.qrCode(sessionId),
    queryFn: () => driverApi.getSessionQrCode(sessionId),
    enabled: Boolean(sessionId),
  });
}
