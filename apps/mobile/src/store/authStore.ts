import { create } from 'zustand';

import { registerUnauthorizedHandler } from '../api/client';
import { authApi } from '../api/auth';
import type { LoginPayload, RegisterPayload, User } from '../types/api';
import { tokenStorage } from '../utils/tokenStorage';
import { welcomeStorage } from '../utils/welcomeStorage';

const DRIVER_ONLY_MESSAGE =
  'This mobile app is only for drivers. Please use the web dashboard for staff/admin access.';

type AuthState = {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  hasSeenWelcome: boolean;
  isWelcomeReady: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
  bootstrap: () => Promise<void>;
  completeWelcome: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set, get) => {
  registerUnauthorizedHandler(async () => {
    await clearStoredAuth();
    set({
      token: null,
      user: null,
      isAuthenticated: false,
      hasSeenWelcome: false,
      isWelcomeReady: true,
    });
  });

  return {
    token: null,
    user: null,
    isAuthenticated: false,
    hasSeenWelcome: false,
    isWelcomeReady: true,

    async login(payload) {
      const response = await authApi.login(payload);
      if (response.user.role !== 'driver') {
        await clearStoredAuth();
        set({
          token: null,
          user: null,
          isAuthenticated: false,
          hasSeenWelcome: false,
          isWelcomeReady: true,
        });
        throw new Error(DRIVER_ONLY_MESSAGE);
      }

      const hasSeenWelcome = await welcomeStorage.hasSeenWelcome(response.user);

      await tokenStorage.saveToken(response.access_token);
      await tokenStorage.saveUser(response.user);
      set({
        token: response.access_token,
        user: response.user,
        isAuthenticated: true,
        hasSeenWelcome,
        isWelcomeReady: true,
      });
    },

    async register(payload) {
      const response = await authApi.register(payload);
      if (response.user.role !== 'driver') {
        await clearStoredAuth();
        set({
          token: null,
          user: null,
          isAuthenticated: false,
          hasSeenWelcome: false,
          isWelcomeReady: true,
        });
        throw new Error(DRIVER_ONLY_MESSAGE);
      }

      const hasSeenWelcome = await welcomeStorage.hasSeenWelcome(response.user);

      await tokenStorage.saveToken(response.access_token);
      await tokenStorage.saveUser(response.user);
      set({
        token: response.access_token,
        user: response.user,
        isAuthenticated: true,
        hasSeenWelcome,
        isWelcomeReady: true,
      });
    },

    async logout() {
      try {
        await authApi.logout();
      } catch {
        // Stateless JWT logout still completes locally if backend is unreachable.
      }

      await clearStoredAuth();
      set({
        token: null,
        user: null,
        isAuthenticated: false,
        hasSeenWelcome: false,
        isWelcomeReady: true,
      });
    },

    async bootstrap() {
      const [token, user] = await Promise.all([
        tokenStorage.getToken(),
        tokenStorage.getUser(),
      ]);

      if (!token || user?.role !== 'driver') {
        await clearStoredAuth();
        set({
          token: null,
          user: null,
          isAuthenticated: false,
          hasSeenWelcome: false,
          isWelcomeReady: true,
        });
        return;
      }

      const hasSeenWelcome = await welcomeStorage.hasSeenWelcome(user);

      set({
        token,
        user,
        isAuthenticated: true,
        hasSeenWelcome,
        isWelcomeReady: true,
      });
    },

    async completeWelcome() {
      const user = get().user;
      if (user) {
        await welcomeStorage.markSeen(user);
      }

      set({ hasSeenWelcome: true, isWelcomeReady: true });
    },
  };
});

async function clearStoredAuth() {
  await tokenStorage.clearToken();
  await tokenStorage.clearUser();
}
