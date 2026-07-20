import { apiClient } from './client';
import type { VehicleRegistrationRequest, VehicleType } from '../types/api';

export const vehicleRegistrationsApi = {
  async getMyRequests() {
    const { data } = await apiClient.get<VehicleRegistrationRequest[]>('/vehicle-registrations/my');
    return data;
  },

  async createRequest(payload: { plateNumber: string; vehicleType: VehicleType }) {
    const { data } = await apiClient.post<VehicleRegistrationRequest>('/vehicle-registrations', payload);
    return data;
  },
};
