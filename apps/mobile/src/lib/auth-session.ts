import { deviceSessionResponseSchema } from '@littletask/contracts';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { API_ROOT } from './api-root';

const sessionKey = 'littletask.device-session.v1';
let memoryToken: string | null = null;
let tokenPromise: Promise<string> | null = null;

async function readToken(): Promise<string | null> {
  if (memoryToken) return memoryToken;
  if (Platform.OS === 'web') {
    try {
      memoryToken = globalThis.localStorage?.getItem(sessionKey) ?? null;
      return memoryToken;
    } catch {
      return null;
    }
  }
  memoryToken = await SecureStore.getItemAsync(sessionKey);
  return memoryToken;
}

async function writeToken(token: string): Promise<void> {
  memoryToken = token;
  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.setItem(sessionKey, token);
    } catch {
      // The in-memory token still supports private browsing sessions.
    }
    return;
  }
  await SecureStore.setItemAsync(sessionKey, token, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
}

async function registerDevice(): Promise<string> {
  const response = await fetch(`${API_ROOT}/auth/device`, {
    method: 'POST',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Device registration failed with ${response.status}`);
  const session = deviceSessionResponseSchema.parse(await response.json());
  await writeToken(session.token);
  return session.token;
}

export function getDeviceToken(): Promise<string> {
  if (!tokenPromise) {
    tokenPromise = readToken()
      .then((token) => token ?? registerDevice())
      .finally(() => {
        tokenPromise = null;
      });
  }
  return tokenPromise;
}

export function refreshDeviceToken(failedToken: string): Promise<string> {
  if (memoryToken && memoryToken !== failedToken) return Promise.resolve(memoryToken);
  if (!tokenPromise) {
    tokenPromise = clearStoredToken(failedToken)
      .then(() => {
        if (memoryToken && memoryToken !== failedToken) return memoryToken;
        return registerDevice();
      })
      .finally(() => {
        tokenPromise = null;
      });
  }
  return tokenPromise;
}

export async function clearDeviceToken(): Promise<void> {
  tokenPromise = null;
  await clearStoredToken(memoryToken);
}

async function clearStoredToken(expectedToken: string | null): Promise<void> {
  if (expectedToken && memoryToken && memoryToken !== expectedToken) return;
  memoryToken = null;
  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.removeItem(sessionKey);
    } catch {
      // Nothing else is required for an unavailable storage backend.
    }
    return;
  }
  await SecureStore.deleteItemAsync(sessionKey);
}
