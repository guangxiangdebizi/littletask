import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { deviceSessionResponseSchema, type DeviceSessionResponse } from '@littletask/contracts';

import type { AuthPrincipal, IntakeStore } from './types';

const tokenPattern = /^lt_[A-Za-z0-9_-]{43}$/;

export class AuthenticationError extends Error {
  readonly code = 'AUTHENTICATION_REQUIRED';
  readonly statusCode = 401;

  constructor() {
    super('A valid device session is required');
    this.name = 'AuthenticationError';
  }
}

export class AuthService {
  constructor(private readonly store: IntakeStore) {}

  async createDeviceSession(): Promise<DeviceSessionResponse> {
    const token = `lt_${randomBytes(32).toString('base64url')}`;
    const session = deviceSessionResponseSchema.parse({
      userId: randomUUID(),
      deviceId: randomUUID(),
      token,
    });
    await this.store.createDeviceSession({
      userId: session.userId,
      deviceId: session.deviceId,
      tokenHash: this.hashToken(token),
      createdAt: new Date(),
    });
    return session;
  }

  async revokeDeviceSession(principal: AuthPrincipal): Promise<void> {
    await this.store.revokeDeviceSession(principal.deviceId);
  }

  async deleteAccount(principal: AuthPrincipal): Promise<void> {
    if (!(await this.store.deleteUser(principal.userId))) throw new AuthenticationError();
  }

  async authenticate(authorization: string | undefined): Promise<AuthPrincipal> {
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!tokenPattern.test(token)) throw new AuthenticationError();
    const principal = await this.store.findDeviceSession(this.hashToken(token));
    if (!principal) throw new AuthenticationError();
    return principal;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
