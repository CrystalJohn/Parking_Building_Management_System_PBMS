import * as SecureStore from 'expo-secure-store';

import type { User } from '../types/api';

const WELCOME_KEY_PREFIX = 'pbms.hasSeenWelcome';

export const welcomeStorage = {
  async hasSeenWelcome(user: User) {
    try {
      const value = await SecureStore.getItemAsync(getWelcomeKey(user));
      return value === 'true';
    } catch {
      return false;
    }
  },

  async markSeen(user: User) {
    try {
      await SecureStore.setItemAsync(getWelcomeKey(user), 'true');
    } catch {
      // Welcome should never block drivers from entering the app.
    }
  },
};

function getWelcomeKey(user: User) {
  const maybeEmail = (user as User & { email?: string | null }).email;
  const identity = user.id || maybeEmail || user.phone || 'unknown-driver';
  return `${WELCOME_KEY_PREFIX}:${identity}`;
}
