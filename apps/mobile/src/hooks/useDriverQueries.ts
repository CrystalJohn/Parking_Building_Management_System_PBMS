import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { driverApi } from '../api/driver';
import type {
  CreateReservationRequest,
  DriverNotification,
  PaymentWorkflow,
  Reservation,
  ReservationAvailabilityRequest,
} from '../types/api';

export const driverQueryKeys = {
  vehicles: ['driver', 'vehicles'] as const,
  availability: ['driver', 'availability'] as const,
  reservationAvailability: (vehicleType: string, plannedArrivalAt: string) =>
    ['driver', 'reservation-availability', vehicleType, plannedArrivalAt] as const,
  reservations: {
    all: ['driver', 'reservations'] as const,
    list: ['driver', 'reservations', 'list'] as const,
    detail: (reservationId: string) => ['driver', 'reservations', 'detail', reservationId] as const,
    checkInQr: (reservationId: string) => ['driver', 'reservations', 'checkin-qr', reservationId] as const,
  },
  activeSessions: ['driver', 'active-sessions'] as const,
  sessionPayment: (sessionId: string) => ['driver', 'session-payment', sessionId] as const,
  notifications: ['driver', 'notifications'] as const,
  history: ['driver', 'history'] as const,
};

export function useMyVehiclesQuery() {
  return useQuery({
    queryKey: driverQueryKeys.vehicles,
    queryFn: driverApi.getMyVehicles,
  });
}

export function useSlotAvailabilityQuery() {
  return useQuery({
    queryKey: driverQueryKeys.availability,
    queryFn: driverApi.getSlotAvailability,
  });
}

export function useReservationAvailabilityQuery(
  vehicleType: ReservationAvailabilityRequest['vehicleType'],
  plannedArrivalAt: string,
) {
  return useQuery({
    queryKey: driverQueryKeys.reservationAvailability(vehicleType, plannedArrivalAt),
    queryFn: () => driverApi.getReservationAvailability({ vehicleType, plannedArrivalAt }),
    enabled: Boolean(vehicleType && plannedArrivalAt),
  });
}

export function useReservationsQuery() {
  return useQuery({
    queryKey: driverQueryKeys.reservations.list,
    queryFn: driverApi.getMyReservations,
  });
}

export function useReservationDetailQuery(reservationId: string) {
  return useQuery({
    queryKey: driverQueryKeys.reservations.detail(reservationId),
    queryFn: () => driverApi.getReservationById(reservationId),
  });
}

export function useReservationCheckInQrQuery(
  reservationId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: driverQueryKeys.reservations.checkInQr(reservationId),
    queryFn: () => driverApi.getReservationCheckInQr(reservationId),
    enabled,
    refetchInterval: enabled ? 30_000 : false,
  });
}

export function useCreateReservationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateReservationRequest) => driverApi.createReservation(payload),
    onSuccess: (reservation: Reservation) => {
      queryClient.setQueryData(
        driverQueryKeys.reservations.detail(reservation.id),
        reservation
      );
      queryClient.invalidateQueries({ queryKey: driverQueryKeys.reservations.all });
      queryClient.invalidateQueries({ queryKey: driverQueryKeys.availability });
      queryClient.invalidateQueries({ queryKey: driverQueryKeys.vehicles });
    },
  });
}

export function useCancelReservationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (reservationId: string) => driverApi.cancelReservation(reservationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: driverQueryKeys.reservations.all });
      queryClient.invalidateQueries({ queryKey: driverQueryKeys.availability });
    },
  });
}

export function useActiveSessionsQuery() {
  return useQuery({
    queryKey: driverQueryKeys.activeSessions,
    queryFn: driverApi.getActiveSessions,
    refetchInterval: 15_000,
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

export function useCreateSessionPaymentMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sessionId: string) => driverApi.createSessionPayment(sessionId),
    onSuccess: (workflow: PaymentWorkflow) => {
      queryClient.setQueryData(driverQueryKeys.sessionPayment(workflow.session.id), workflow);
      queryClient.invalidateQueries({ queryKey: driverQueryKeys.activeSessions });
      queryClient.invalidateQueries({ queryKey: driverQueryKeys.notifications });
    },
  });
}

export function useSessionPaymentStatusQuery(sessionId?: string, enabled = true) {
  return useQuery({
    queryKey: driverQueryKeys.sessionPayment(sessionId ?? 'unknown'),
    queryFn: () => driverApi.getSessionPaymentStatus(sessionId!),
    enabled: Boolean(sessionId) && enabled,
    refetchInterval: enabled ? 4_000 : false,
  });
}

export function useNotificationsQuery() {
  return useQuery({
    queryKey: driverQueryKeys.notifications,
    queryFn: (): Promise<DriverNotification[]> => driverApi.getMyNotifications(),
  });
}

