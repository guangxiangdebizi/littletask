import type { FastifyPluginAsync } from 'fastify';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health/live', async () => ({ status: 'ok' }));
  app.get('/health/ready', async () => ({ status: 'ready', provider: app.appConfig.AI_PROVIDER }));
  app.get('/metrics', async (_request, reply) =>
    reply.type('text/plain; version=0.0.4').send(app.metrics.render()),
  );
};
