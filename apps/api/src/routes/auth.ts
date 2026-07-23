import type { FastifyPluginAsync } from 'fastify';

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/auth/device', async (request, reply) => {
    app.rateLimiter.consume(
      `registration:${request.ip}`,
      app.appConfig.RATE_LIMIT_REGISTRATIONS,
      app.appConfig.RATE_LIMIT_WINDOW_MS,
    );
    return reply.code(201).send(await app.authService.createDeviceSession());
  });

  app.delete('/auth/device', async (request, reply) => {
    const principal = await app.authService.authenticate(request.headers.authorization);
    await app.authService.revokeDeviceSession(principal);
    return reply.code(204).send();
  });

  app.delete('/account', async (request, reply) => {
    const principal = await app.authService.authenticate(request.headers.authorization);
    app.rateLimiter.consume(
      `request:${principal.deviceId}`,
      app.appConfig.RATE_LIMIT_REQUESTS,
      app.appConfig.RATE_LIMIT_WINDOW_MS,
    );
    await app.authService.deleteAccount(principal);
    return reply.code(204).send();
  });
};
