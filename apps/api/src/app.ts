import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import { loadConfig, type AppConfig } from './config';
import { AuthenticationError, AuthService } from './auth-service';
import { DomainError } from './intake-service';
import { MetricsRegistry } from './metrics';
import { FixedWindowRateLimiter, RateLimitError } from './rate-limiter';
import { authRoutes } from './routes/auth';
import { healthRoutes } from './routes/health';
import { intakeRoutes } from './routes/intakes';
import { createIntakeService } from './runtime';
import type { AIProvider, IntakeStore } from './types';

export interface BuildAppOptions {
  config?: AppConfig;
  logger?: boolean;
  provider?: AIProvider;
  store?: IntakeStore;
  inlineWorker?: boolean;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const config = options.config ?? loadConfig();
  const app = Fastify({
    trustProxy: config.TRUST_PROXY,
    logger:
      options.logger === false
        ? false
        : {
            level: config.LOG_LEVEL,
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'res.headers["set-cookie"]',
                '*.OPENAI_API_KEY',
              ],
              censor: '[REDACTED]',
            },
            transport:
              config.NODE_ENV === 'development'
                ? {
                    target: 'pino-pretty',
                    options: { colorize: true, translateTime: 'SYS:standard' },
                  }
                : undefined,
          },
    bodyLimit: config.MAX_UPLOAD_BYTES + 128 * 1024,
  });

  const runtime = createIntakeService(config, {
    ...(options.provider ? { provider: options.provider } : {}),
    ...(options.store ? { store: options.store } : {}),
    ...(options.inlineWorker === undefined ? {} : { inlineWorker: options.inlineWorker }),
  });
  app.decorate('appConfig', config);
  app.decorate('authService', new AuthService(runtime.store));
  app.decorate('intakeService', runtime.service);
  app.decorate('metrics', new MetricsRegistry());
  app.decorate('rateLimiter', new FixedWindowRateLimiter());
  app.decorateRequest('auth', null);
  app.addHook('onClose', async () => runtime.store.close());
  app.addHook('onResponse', async (request, reply) => {
    app.metrics.observe(
      request.method,
      request.routeOptions.url ?? 'unmatched',
      reply.statusCode,
      reply.elapsedTime,
    );
  });

  await app.register(cors, {
    origin: config.NODE_ENV === 'development' ? true : config.WEB_ORIGIN,
    credentials: false,
  });
  await app.register(multipart, {
    limits: { files: 1, fileSize: config.MAX_UPLOAD_BYTES, fields: 8 },
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof DomainError) {
      return reply.code(error.statusCode).send({
        error: { code: error.code, message: error.message, requestId: request.id },
      });
    }
    if (error instanceof AuthenticationError) {
      return reply.code(error.statusCode).send({
        error: { code: error.code, message: error.message, requestId: request.id },
      });
    }
    if (error instanceof RateLimitError) {
      void reply.header('Retry-After', error.retryAfterSeconds);
      return reply.code(error.statusCode).send({
        error: { code: error.code, message: error.message, requestId: request.id },
      });
    }
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          requestId: request.id,
          details: error.issues,
        },
      });
    }
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'FST_REQ_FILE_TOO_LARGE'
    ) {
      return reply.code(413).send({
        error: {
          code: 'IMAGE_TOO_LARGE',
          message: `Screenshot must be smaller than ${config.MAX_UPLOAD_BYTES} bytes`,
          requestId: request.id,
        },
      });
    }

    request.log.error({ err: error }, 'Unhandled request error');
    return reply.code(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error', requestId: request.id },
    });
  });

  await app.register(healthRoutes, { prefix: '/api' });
  await app.register(authRoutes, { prefix: '/api/v1' });
  await app.register(intakeRoutes, { prefix: '/api/v1' });
  return app;
}
