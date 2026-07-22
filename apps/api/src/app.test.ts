import { setTimeout as wait } from 'node:timers/promises';

import type {
  ActionCard,
  ActivityEvent,
  DataSummary,
  HistoryPage,
  Insight,
} from '@littletask/contracts';
import { describe, expect, it } from 'vitest';

import { buildApp } from './app';
import { loadConfig } from './config';

function multipartScreenshot(): { payload: Buffer; contentType: string } {
  const boundary = '----littletask-test-boundary';
  const lines = [
    `--${boundary}\r\n`,
    'Content-Disposition: form-data; name="note"\r\n\r\n',
    '明天下午三点见，我的新号码是 13800138000。\r\n',
    `--${boundary}\r\n`,
    'Content-Disposition: form-data; name="timezone"\r\n\r\n',
    'Asia/Shanghai\r\n',
    `--${boundary}\r\n`,
    'Content-Disposition: form-data; name="screenshot"; filename="chat.png"\r\n',
    'Content-Type: image/png\r\n\r\n',
  ];
  const payload = Buffer.concat([
    Buffer.from(lines.join('')),
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { payload, contentType: `multipart/form-data; boundary=${boundary}` };
}

describe('LittleTask API', () => {
  it('runs the fake screenshot-to-action flow with an explicit confirmation gate', async () => {
    const app = await buildApp({
      config: loadConfig({ NODE_ENV: 'test', AI_PROVIDER: 'fake', LOG_LEVEL: 'silent' }),
      logger: false,
    });
    const upload = multipartScreenshot();

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/intakes',
      headers: { 'content-type': upload.contentType },
      payload: upload.payload,
    });
    expect(created.statusCode).toBe(202);
    const { id } = created.json<{ id: string }>();

    await wait(120);
    const analyzed = await app.inject({ method: 'GET', url: `/api/v1/intakes/${id}` });
    expect(analyzed.statusCode).toBe(200);
    const intake = analyzed.json<{
      status: string;
      actions: ActionCard[];
    }>();
    expect(intake.status).toBe('ready');
    expect(intake.actions).toHaveLength(3);

    const initialAction = intake.actions[0];
    expect(initialAction).toBeDefined();
    if (!initialAction || initialAction.type !== 'create_event') {
      throw new Error('Expected a meeting action');
    }

    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/v1/actions/${initialAction.id}`,
      payload: {
        expectedRevision: initialAction.revision,
        payload: { ...initialAction.payload, title: '与张明确认方案' },
      },
    });
    expect(patched.statusCode).toBe(200);
    const action = patched.json<ActionCard>();
    expect(action.revision).toBe(initialAction.revision + 1);
    expect(action.type === 'create_event' ? action.payload.title : null).toBe('与张明确认方案');

    const stalePatch = await app.inject({
      method: 'PATCH',
      url: `/api/v1/actions/${initialAction.id}`,
      payload: {
        expectedRevision: initialAction.revision,
        payload: initialAction.payload,
      },
    });
    expect(stalePatch.statusCode).toBe(409);

    const executionBeforeConfirmation = await app.inject({
      method: 'POST',
      url: `/api/v1/actions/${action.id}/execution-result`,
      payload: {
        idempotencyKey: crypto.randomUUID(),
        status: 'succeeded',
      },
    });
    expect(executionBeforeConfirmation.statusCode).toBe(409);

    const staleConfirmation = await app.inject({
      method: 'POST',
      url: `/api/v1/actions/${action.id}/confirm`,
      payload: {
        expectedRevision: initialAction.revision,
        idempotencyKey: crypto.randomUUID(),
      },
    });
    expect(staleConfirmation.statusCode).toBe(409);

    const idempotencyKey = crypto.randomUUID();
    const confirmed = await app.inject({
      method: 'POST',
      url: `/api/v1/actions/${action.id}/confirm`,
      payload: { expectedRevision: action.revision, idempotencyKey },
    });
    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.json<{ status: string }>().status).toBe('confirmed');

    const executed = await app.inject({
      method: 'POST',
      url: `/api/v1/actions/${action.id}/execution-result`,
      payload: {
        idempotencyKey,
        status: 'succeeded',
        nativeRecordRef: 'test-calendar-1',
        deviceContext: {
          possibleDuplicateContactCount: 0,
          calendarConflictCount: 2,
        },
      },
    });
    expect(executed.statusCode).toBe(200);
    expect(executed.json<{ status: string }>().status).toBe('succeeded');

    const insights = await app.inject({
      method: 'GET',
      url: `/api/v1/intakes/${id}/insights`,
    });
    expect(insights.statusCode).toBe(200);
    const insightItems = insights.json<{ items: Insight[] }>().items;
    expect(insightItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionId: action.id,
          type: 'schedule_conflict',
          kind: 'observation',
          evidence: expect.arrayContaining([expect.objectContaining({ source: 'calendar_check' })]),
        }),
        expect.objectContaining({
          actionId: action.id,
          type: 'meeting_preparation',
          kind: 'suggestion',
        }),
      ]),
    );

    const retryableAction = intake.actions.find((item) => item.type === 'create_contact');
    if (!retryableAction) {
      throw new Error('Expected a create-contact action');
    }
    const confirmationIdempotencyKey = crypto.randomUUID();
    await app.inject({
      method: 'POST',
      url: `/api/v1/actions/${retryableAction.id}/confirm`,
      payload: {
        expectedRevision: retryableAction.revision,
        idempotencyKey: confirmationIdempotencyKey,
      },
    });
    const firstExecutionKey = crypto.randomUUID();
    const failed = await app.inject({
      method: 'POST',
      url: `/api/v1/actions/${retryableAction.id}/execution-result`,
      payload: {
        idempotencyKey: firstExecutionKey,
        confirmationIdempotencyKey,
        status: 'failed',
        errorMessage: 'DEVICE_WRITE_FAILED',
        deviceContext: {
          possibleDuplicateContactCount: 1,
          calendarConflictCount: 0,
        },
      },
    });
    expect(failed.json<{ status: string }>().status).toBe('failed');

    const repeatedFailureKey = crypto.randomUUID();
    const repeatedFailure = await app.inject({
      method: 'POST',
      url: `/api/v1/actions/${retryableAction.id}/execution-result`,
      payload: {
        idempotencyKey: repeatedFailureKey,
        confirmationIdempotencyKey,
        status: 'failed',
        errorMessage: 'DEVICE_WRITE_FAILED',
      },
    });
    expect(repeatedFailure.json<{ status: string }>().status).toBe('failed');

    const conflictingReplay = await app.inject({
      method: 'POST',
      url: `/api/v1/actions/${retryableAction.id}/execution-result`,
      payload: {
        idempotencyKey: firstExecutionKey,
        confirmationIdempotencyKey,
        status: 'succeeded',
      },
    });
    expect(conflictingReplay.statusCode).toBe(409);

    const retried = await app.inject({
      method: 'POST',
      url: `/api/v1/actions/${retryableAction.id}/execution-result`,
      payload: {
        idempotencyKey: crypto.randomUUID(),
        confirmationIdempotencyKey,
        status: 'succeeded',
        nativeRecordRef: 'test-contact-1',
        deviceContext: {
          possibleDuplicateContactCount: 1,
          calendarConflictCount: 0,
        },
      },
    });
    expect(retried.json<{ status: string }>().status).toBe('succeeded');

    const lateFailure = await app.inject({
      method: 'POST',
      url: `/api/v1/actions/${retryableAction.id}/execution-result`,
      payload: {
        idempotencyKey: crypto.randomUUID(),
        confirmationIdempotencyKey,
        status: 'failed',
        errorMessage: 'LATE_FAILURE',
      },
    });
    expect(lateFailure.statusCode).toBe(409);

    const replayedFailure = await app.inject({
      method: 'POST',
      url: `/api/v1/actions/${retryableAction.id}/execution-result`,
      payload: {
        idempotencyKey: repeatedFailureKey,
        confirmationIdempotencyKey,
        status: 'failed',
        errorMessage: 'DEVICE_WRITE_FAILED',
      },
    });
    expect(replayedFailure.json<{ status: string }>().status).toBe('succeeded');

    const refreshedInsights = await app.inject({
      method: 'GET',
      url: `/api/v1/intakes/${id}/insights`,
    });
    expect(refreshedInsights.json<{ items: Insight[] }>().items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionId: retryableAction.id,
          type: 'duplicate_contact',
          kind: 'observation',
          evidence: expect.arrayContaining([expect.objectContaining({ source: 'contact_check' })]),
        }),
      ]),
    );

    const activity = await app.inject({
      method: 'GET',
      url: `/api/v1/intakes/${id}/activity`,
    });
    expect(activity.statusCode).toBe(200);
    expect(activity.json<{ items: ActivityEvent[] }>().items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'analysis_completed', source: 'ai' }),
        expect.objectContaining({
          type: 'action_revised',
          source: 'user',
          actionId: action.id,
          revision: 2,
        }),
        expect.objectContaining({ type: 'action_confirmed', actionId: action.id }),
        expect.objectContaining({ type: 'execution_succeeded', actionId: action.id }),
      ]),
    );

    const removed = await app.inject({ method: 'DELETE', url: `/api/v1/intakes/${id}` });
    expect(removed.statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: `/api/v1/intakes/${id}` })).statusCode).toBe(
      404,
    );
    const afterDelete = await app.inject({ method: 'GET', url: '/api/v1/data-summary' });
    expect(afterDelete.json<DataSummary>()).toMatchObject({
      intakes: 0,
      actions: 0,
      executionResults: 0,
      insights: 0,
      temporaryScreenshots: 0,
      screenshotsRetainedAfterAnalysis: false,
    });

    await app.close();
  });

  it('paginates history with an opaque cursor and can clear all server data', async () => {
    const app = await buildApp({
      config: loadConfig({ NODE_ENV: 'test', AI_PROVIDER: 'fake', LOG_LEVEL: 'silent' }),
      logger: false,
      inlineWorker: false,
    });
    const ids: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const upload = multipartScreenshot();
      const created = await app.inject({
        method: 'POST',
        url: '/api/v1/intakes',
        headers: { 'content-type': upload.contentType },
        payload: upload.payload,
      });
      ids.push(created.json<{ id: string }>().id);
    }

    const firstPage = (
      await app.inject({ method: 'GET', url: '/api/v1/history?limit=2' })
    ).json<HistoryPage>();
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.nextCursor).toBeTruthy();
    const secondPage = (
      await app.inject({
        method: 'GET',
        url: `/api/v1/history?limit=2&cursor=${encodeURIComponent(firstPage.nextCursor ?? '')}`,
      })
    ).json<HistoryPage>();
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.nextCursor).toBeNull();
    expect(new Set([...firstPage.items, ...secondPage.items].map((item) => item.id))).toEqual(
      new Set(ids),
    );

    const invalidCursor = await app.inject({
      method: 'GET',
      url: '/api/v1/history?cursor=not-a-valid-cursor',
    });
    expect(invalidCursor.statusCode).toBe(400);
    expect(invalidCursor.json<{ error: { code: string } }>().error.code).toBe(
      'INVALID_HISTORY_CURSOR',
    );

    const summary = (
      await app.inject({ method: 'GET', url: '/api/v1/data-summary' })
    ).json<DataSummary>();
    expect(summary).toMatchObject({ intakes: 3, actions: 0, temporaryScreenshots: 3 });

    const cleared = await app.inject({ method: 'DELETE', url: '/api/v1/history' });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json<{ deletedIntakes: number }>().deletedIntakes).toBe(3);
    expect(
      (await app.inject({ method: 'GET', url: '/api/v1/data-summary' })).json<DataSummary>(),
    ).toMatchObject({ intakes: 0, temporaryScreenshots: 0 });

    await app.close();
  });
});
