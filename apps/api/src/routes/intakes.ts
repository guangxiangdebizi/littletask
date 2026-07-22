import {
  actionConfirmationRequestSchema,
  actionPatchRequestSchema,
  executionResultRequestSchema,
  historyQuerySchema,
} from '@littletask/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { AuthenticationError } from '../auth-service';
import type { AuthPrincipal } from '../types';

const acceptedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic']);

interface IntakeParams {
  id: string;
}

interface ActionParams {
  id: string;
}

function userId(auth: AuthPrincipal | null): string {
  if (!auth) throw new AuthenticationError();
  return auth.userId;
}

export const intakeRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', async (request) => {
    request.auth = await app.authService.authenticate(request.headers.authorization);
    app.rateLimiter.consume(
      `request:${request.auth.deviceId}`,
      app.appConfig.RATE_LIMIT_REQUESTS,
      app.appConfig.RATE_LIMIT_WINDOW_MS,
    );
    if (request.method === 'POST' && request.routeOptions.url.endsWith('/intakes')) {
      app.rateLimiter.consume(
        `upload:${request.auth.deviceId}`,
        app.appConfig.RATE_LIMIT_UPLOADS,
        app.appConfig.RATE_LIMIT_WINDOW_MS,
      );
    }
  });

  app.post('/intakes', async (request, reply) => {
    let image: Buffer | undefined;
    let mimeType = '';
    let originalName: string | null = null;
    const fields = new Map<string, string>();

    for await (const part of request.parts()) {
      if (part.type === 'file') {
        if (part.fieldname !== 'screenshot' || image) {
          part.file.resume();
          continue;
        }
        if (!acceptedImageTypes.has(part.mimetype)) {
          part.file.resume();
          return reply.code(415).send({
            error: {
              code: 'UNSUPPORTED_IMAGE_TYPE',
              message: 'Screenshot must be JPEG, PNG, WebP, or HEIC',
              requestId: request.id,
            },
          });
        }
        image = await part.toBuffer();
        mimeType = part.mimetype;
        originalName = part.filename || null;
      } else {
        fields.set(part.fieldname, String(part.value));
      }
    }

    if (!image) {
      return reply.code(400).send({
        error: {
          code: 'SCREENSHOT_REQUIRED',
          message: 'A screenshot file is required',
          requestId: request.id,
        },
      });
    }

    const nowValue = fields.get('now');
    const now = nowValue ? new Date(nowValue) : new Date();
    if (Number.isNaN(now.getTime())) {
      return reply.code(400).send({
        error: {
          code: 'INVALID_NOW',
          message: 'now must be an ISO date-time',
          requestId: request.id,
        },
      });
    }

    const intake = await app.intakeService.create(userId(request.auth), {
      image,
      mimeType,
      originalName,
      note: fields.get('note')?.trim() || null,
      locale: fields.get('locale') || 'zh-CN',
      timezone: fields.get('timezone') || 'Asia/Shanghai',
      now,
    });

    return reply.code(202).send({ id: intake.id, status: intake.status });
  });

  app.get<{ Params: IntakeParams }>('/intakes/:id', async (request) =>
    app.intakeService.get(userId(request.auth), request.params.id),
  );

  app.get('/history', async (request) =>
    app.intakeService.listHistory(userId(request.auth), historyQuerySchema.parse(request.query)),
  );

  app.delete('/history', async (request) => app.intakeService.deleteAll(userId(request.auth)));

  app.get('/data-summary', async (request) =>
    app.intakeService.getDataSummary(userId(request.auth)),
  );

  app.delete<{ Params: IntakeParams }>('/intakes/:id', async (request, reply) => {
    await app.intakeService.delete(userId(request.auth), request.params.id);
    return reply.code(204).send();
  });

  app.patch<{ Params: ActionParams }>('/actions/:id', async (request) => {
    const body = actionPatchRequestSchema.parse(request.body);
    return app.intakeService.patchAction(userId(request.auth), request.params.id, body);
  });

  app.post<{ Params: ActionParams }>('/actions/:id/confirm', async (request) => {
    const body = actionConfirmationRequestSchema.parse(request.body);
    return app.intakeService.confirmAction(
      userId(request.auth),
      request.params.id,
      body.expectedRevision,
      body.idempotencyKey,
    );
  });

  app.post<{ Params: ActionParams }>('/actions/:id/execution-result', async (request) => {
    const body = executionResultRequestSchema.parse(request.body);
    return app.intakeService.reportExecution(userId(request.auth), request.params.id, body);
  });

  app.get<{ Params: IntakeParams }>('/intakes/:id/insights', async (request) =>
    app.intakeService.getInsights(userId(request.auth), request.params.id),
  );

  app.get<{ Params: IntakeParams }>('/intakes/:id/activity', async (request) =>
    app.intakeService.getActivity(userId(request.auth), request.params.id),
  );
};
