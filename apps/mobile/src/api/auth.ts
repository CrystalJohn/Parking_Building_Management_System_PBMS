import { apiClient } from './client';
import type { AuthResponse, LoginPayload, RegisterPayload } from '../types/api';

export const authApi = {
  async login(payload: LoginPayload) {
    const { data } = await apiClient.post<AuthResponse>('/auth/login', payload);
    return data;
  },

  async register(payload: RegisterPayload) {
    const { data } = await apiClient.post<AuthResponse>('/auth/register', payload);
    return data;
  },

  async logout() {
    await apiClient.post('/auth/logout');
  },
};
