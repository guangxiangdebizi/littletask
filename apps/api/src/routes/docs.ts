import type { FastifyPluginAsync } from 'fastify';

import { openapiDocument } from '../openapi';

export const docsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/openapi.json', async (_request, reply) =>
    reply
      .header('Cache-Control', 'public, max-age=300')
      .type('application/vnd.oai.openapi+json;version=3.1')
      .send(openapiDocument),
  );
};
