import * as SecureStore from 'expo-secure-store';

import type { User } from '../types/api';

const ACCESS_TOKEN_KEY = 'pbms.accessToken';
const USER_KEY = 'pbms.user';

export const tokenStorage = {
  async getToken() {
    return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  },

  async saveToken(token: string) {
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token);
  },

  async clearToken() {
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
  },

  async getUser(): Promise<User | null> {
    const value = await SecureStore.getItemAsync(USER_KEY);
    return value ? (JSON.parse(value) as User) : null;
  },

  async saveUser(user: User) {
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
  },

  async clearUser() {
    await SecureStore.deleteItemAsync(USER_KEY);
  },
};
