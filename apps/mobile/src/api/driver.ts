import { apiClient } from './client';
import type {
  CreateReservationRequest,
  CreateReservationResponse,
  DriverNotification,
  DriverVehicle,
  ParkingSession,
  PaymentWorkflow,
  Reservation,
  ReservationAvailabilityRequest,
  ReservationCheckInQr,
  ReservationAvailability,
  SlotAvailability,
} from '../types/api';

export const driverApi = {
  async getMyVehicles() {
    const { data } = await apiClient.get<DriverVehicle[]>('/vehicles/my');
    return data;
  },

  async getSlotAvailability() {
    const { data } = await apiClient.get<SlotAvailability>('/slots/availability');
    return data;
  },

  async getReservationAvailability(payload: ReservationAvailabilityRequest) {
    const { data } = await apiClient.get<ReservationAvailability>('/slots/availability', {
      params: payload,
    });
    return data;
  },

  async getMyReservations() {
    const { data } = await apiClient.get<Reservation[]>('/reservations/my');
    return data;
  },

  async createReservation(payload: CreateReservationRequest) {
    const { data } = await apiClient.post<CreateReservationResponse>('/reservations', payload);
    return normalizeReservationResponse(data);
  },

  async cancelReservation(id: string) {
    const { data } = await apiClient.delete<Reservation>(`/reservations/${id}`);
    return data;
  },

  async getReservationById(id: string) {
    const { data } = await apiClient.get<Reservation>(`/reservations/${id}`);
    return data;
  },

  async getReservationCheckInQr(id: string) {
    const { data } = await apiClient.get<ReservationCheckInQr>(`/reservations/${id}/checkin-qr`);
    return data;
  },

  async getActiveSessions() {
    const { data } = await apiClient.get<ParkingSession[]>('/sessions/my-active');
    return data;
  },

  async createSessionPayment(sessionId: string) {
    const { data } = await apiClient.post<PaymentWorkflow>(`/sessions/${sessionId}/pay`, {
      method: 'bank_qr',
    });
    return data;
  },

  async getSessionPaymentStatus(sessionId: string) {
    const { data } = await apiClient.get<PaymentWorkflow>(`/sessions/${sessionId}/payment-status`);
    return data;
  },

  async getParkingHistory() {
    const { data } = await apiClient.get<ParkingSession[]>('/sessions/my-history');
    return data;
  },

  async getMyNotifications() {
    const { data } = await apiClient.get<DriverNotification[]>('/notifications/my');
    return data;
  },

};

function normalizeReservationResponse(data: CreateReservationResponse): Reservation {
  if ('reservation' in data) {
    return {
      ...data.reservation,
      slot: data.slot
        ? {
            ...data.slot,
            floorId: data.slot.floorId ?? data.slot.floor?.id ?? 0,
          }
        : undefined,
    };
  }

  return data;
}
