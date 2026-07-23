import type { FastifyPluginAsync } from 'fastify';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health/live', async () => ({ status: 'ok' }));
  app.get('/health/ready', async (_request, reply) => {
    try {
      await app.intakeService.checkReadiness();
      return { status: 'ready', provider: app.appConfig.AI_PROVIDER };
    } catch {
      app.log.warn({ code: 'READINESS_CHECK_FAILED' }, 'Readiness dependency check failed');
      return reply.code(503).send({ status: 'unavailable' });
    }
  });
  app.get('/metrics', async (_request, reply) =>
    reply.type('text/plain; version=0.0.4').send(app.metrics.render()),
  );
};
