import { Platform } from 'react-native';

function resolveApiRoot(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
  if (configured) return configured;

  if (Platform.OS === 'web' && typeof globalThis.location !== 'undefined') {
    const { origin, hostname } = globalThis.location;
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
      return `${origin}/api/v1`;
    }
  }

  return 'http://127.0.0.1:3100/api/v1';
}

export const API_ROOT = resolveApiRoot();
