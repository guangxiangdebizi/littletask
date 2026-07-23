import type { AppConfig } from './config';
import type { AuthService } from './auth-service';
import type { IntakeService } from './intake-service';
import type { AuthPrincipal } from './types';
import type { MetricsRegistry } from './metrics';
import type { FixedWindowRateLimiter } from './rate-limiter';

declare module 'fastify' {
  interface FastifyInstance {
    appConfig: AppConfig;
    authService: AuthService;
    intakeService: IntakeService;
    metrics: MetricsRegistry;
    rateLimiter: FixedWindowRateLimiter;
  }

  interface FastifyRequest {
    auth: AuthPrincipal | null;
  }
}
