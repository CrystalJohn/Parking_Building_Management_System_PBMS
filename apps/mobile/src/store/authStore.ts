import { create } from 'zustand';

import { authApi } from '../api/auth';
import type { LoginPayload, RegisterPayload, User } from '../types/api';
import { tokenStorage } from '../utils/tokenStorage';

type AuthState = {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
  bootstrap: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  isAuthenticated: false,

  async login(payload) {
    const response = await authApi.login(payload);
    await tokenStorage.saveToken(response.access_token);
    await tokenStorage.saveUser(response.user);
    set({
      token: response.access_token,
      user: response.user,
      isAuthenticated: true,
    });
  },

  async register(payload) {
    const response = await authApi.register(payload);
    await tokenStorage.saveToken(response.access_token);
    await tokenStorage.saveUser(response.user);
    set({
      token: response.access_token,
      user: response.user,
      isAuthenticated: true,
    });
  },

  async logout() {
    try {
      await authApi.logout();
    } catch {
      // Stateless JWT logout still completes locally if backend is unreachable.
    }

    await tokenStorage.clearToken();
    await tokenStorage.clearUser();
    set({ token: null, user: null, isAuthenticated: false });
  },

  async bootstrap() {
    const [token, user] = await Promise.all([
      tokenStorage.getToken(),
      tokenStorage.getUser(),
    ]);

    set({
      token,
      user,
      isAuthenticated: Boolean(token),
    });
  },
}));
