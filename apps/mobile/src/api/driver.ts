import { apiClient } from './client';
import type {
  CreateReservationRequest,
  CreateReservationResponse,
  ParkingSession,
  Reservation,
  ReservationAvailability,
  SlotAvailability,
} from '../types/api';

export const driverApi = {
  async getSlotAvailability() {
    const { data } = await apiClient.get<SlotAvailability>('/slots/availability');
    return data;
  },

  async getReservationAvailability(payload: CreateReservationRequest) {
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

  async getActiveSessions() {
    const { data } = await apiClient.get<ParkingSession[]>('/sessions/my-active');
    return data;
  },

  async getParkingHistory() {
    const { data } = await apiClient.get<ParkingSession[]>('/sessions/my-history');
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
