import { apiClient } from './client';
import type {
  ParkingSession,
  QrCodeResponse,
  Reservation,
  SlotAvailability,
  VehicleType,
} from '../types/api';

export const driverApi = {
  async getSlotAvailability() {
    const { data } = await apiClient.get<SlotAvailability>('/slots/availability');
    return data;
  },

  async getMyReservations() {
    const { data } = await apiClient.get<Reservation[]>('/reservations/my');
    return data;
  },

  async createReservation(vehicleType: VehicleType) {
    const { data } = await apiClient.post<Reservation>('/reservations', { vehicleType });
    return data;
  },

  async cancelReservation(id: string) {
    const { data } = await apiClient.delete<Reservation>(`/reservations/${id}`);
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

  async getSessionQrCode(sessionId: string) {
    const { data } = await apiClient.get<QrCodeResponse>(`/sessions/${sessionId}/qr`);
    return data;
  },
};
