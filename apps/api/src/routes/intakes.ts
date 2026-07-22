import {
  actionConfirmationRequestSchema,
  actionPatchRequestSchema,
  executionResultRequestSchema,
  historyQuerySchema,
} from '@littletask/contracts';
import type { FastifyPluginAsync } from 'fastify';

const acceptedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic']);

interface IntakeParams {
  id: string;
}

interface ActionParams {
  id: string;
}

export const intakeRoutes: FastifyPluginAsync = async (app) => {
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

    const intake = await app.intakeService.create({
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
    app.intakeService.get(request.params.id),
  );

  app.get('/history', async (request) =>
    app.intakeService.listHistory(historyQuerySchema.parse(request.query)),
  );

  app.delete('/history', async () => app.intakeService.deleteAll());

  app.get('/data-summary', async () => app.intakeService.getDataSummary());

  app.delete<{ Params: IntakeParams }>('/intakes/:id', async (request, reply) => {
    await app.intakeService.delete(request.params.id);
    return reply.code(204).send();
  });

  app.patch<{ Params: ActionParams }>('/actions/:id', async (request) => {
    const body = actionPatchRequestSchema.parse(request.body);
    return app.intakeService.patchAction(request.params.id, body);
  });

  app.post<{ Params: ActionParams }>('/actions/:id/confirm', async (request) => {
    const body = actionConfirmationRequestSchema.parse(request.body);
    return app.intakeService.confirmAction(
      request.params.id,
      body.expectedRevision,
      body.idempotencyKey,
    );
  });

  app.post<{ Params: ActionParams }>('/actions/:id/execution-result', async (request) => {
    const body = executionResultRequestSchema.parse(request.body);
    return app.intakeService.reportExecution(request.params.id, body);
  });

  app.get<{ Params: IntakeParams }>('/intakes/:id/insights', async (request) =>
    app.intakeService.getInsights(request.params.id),
  );

  app.get<{ Params: IntakeParams }>('/intakes/:id/activity', async (request) =>
    app.intakeService.getActivity(request.params.id),
  );
};
