import axios from 'axios';
import { Platform } from 'react-native';

import { tokenStorage } from '../utils/tokenStorage';

type UnauthorizedHandler = () => Promise<void> | void;

let unauthorizedHandler: UnauthorizedHandler | null = null;
let isHandlingUnauthorized = false;

const defaultBaseURL = Platform.select({
  android: 'http://10.0.2.2:3001',
  ios: 'http://localhost:3001',
  web: 'http://localhost:3001',
  default: 'http://localhost:3001',
});

export const apiClient = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL ?? defaultBaseURL,
  timeout: 15_000,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use(async (config) => {
  const token = await tokenStorage.getToken();

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      await handleUnauthorized();
    }

    return Promise.reject(error);
  },
);

export function registerUnauthorizedHandler(handler: UnauthorizedHandler) {
  unauthorizedHandler = handler;

  return () => {
    if (unauthorizedHandler === handler) {
      unauthorizedHandler = null;
    }
  };
}

export function getErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message;
    if (Array.isArray(message)) {
      return message.join('\n');
    }
    if (typeof message === 'string') {
      return message;
    }
    return error.message;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Unexpected error';
}

async function handleUnauthorized() {
  if (!unauthorizedHandler || isHandlingUnauthorized) {
    return;
  }

  isHandlingUnauthorized = true;
  try {
    await unauthorizedHandler();
  } finally {
    isHandlingUnauthorized = false;
  }
}
