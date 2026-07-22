import type {
  ActionCard,
  ActivityEvent,
  DataSummary,
  InsightResponse,
} from '@littletask/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from './app';
import { loadConfig } from './config';
import { createIntakeService } from './runtime';
import { createPrismaClient, PrismaIntakeStore } from './stores/prisma-store';

const databaseUrl = process.env.TEST_DATABASE_URL;

function multipartScreenshot(note = '明天下午三点见，我的新号码是 13800138000。') {
  const boundary = '----littletask-postgres-test-boundary';
  const payload = Buffer.concat([
    Buffer.from(
      [
        `--${boundary}\r\n`,
        'Content-Disposition: form-data; name="note"\r\n\r\n',
        `${note}\r\n`,
        `--${boundary}\r\n`,
        'Content-Disposition: form-data; name="timezone"\r\n\r\n',
        'Asia/Shanghai\r\n',
        `--${boundary}\r\n`,
        'Content-Disposition: form-data; name="screenshot"; filename="chat.png"\r\n',
        'Content-Type: image/png\r\n\r\n',
      ].join(''),
    ),
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { payload, contentType: `multipart/form-data; boundary=${boundary}` };
}

describe.skipIf(!databaseUrl)('PostgreSQL persistence and queue', () => {
  if (!databaseUrl) return;

  const prisma = createPrismaClient(databaseUrl);
  const config = loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    AI_PROVIDER: 'fake',
    PERSISTENCE_PROVIDER: 'postgres',
    DATABASE_URL: databaseUrl,
    JOB_MAX_ATTEMPTS: '3',
    JOB_LEASE_MS: '1000',
    JOB_POLL_MS: '100',
  });

  beforeAll(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "intakes" RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('survives API/worker restarts and deduplicates confirmations and executions', async () => {
    const apiBeforeRestart = await buildApp({ config, logger: false, inlineWorker: false });
    const upload = multipartScreenshot();
    const created = await apiBeforeRestart.inject({
      method: 'POST',
      url: '/api/v1/intakes',
      headers: { 'content-type': upload.contentType },
      payload: upload.payload,
    });
    expect(created.statusCode).toBe(202);
    const { id } = created.json<{ id: string }>();
    await apiBeforeRestart.close();

    expect(await prisma.analysisJob.count({ where: { intakeId: id, status: 'queued' } })).toBe(1);

    const workerStore = new PrismaIntakeStore(createPrismaClient(databaseUrl));
    const worker = createIntakeService(config, { store: workerStore, inlineWorker: false });
    expect(await worker.service.processNextJob('integration-worker')).toBe(true);
    await workerStore.close();

    const apiAfterRestart = await buildApp({ config, logger: false, inlineWorker: false });
    const analyzed = await apiAfterRestart.inject({
      method: 'GET',
      url: `/api/v1/intakes/${id}`,
    });
    expect(analyzed.statusCode).toBe(200);
    const intake = analyzed.json<{
      status: string;
      actions: ActionCard[];
    }>();
    expect(intake.status).toBe('ready');
    expect(intake.actions).toHaveLength(3);

    const action = intake.actions[0];
    if (!action) throw new Error('Expected an analyzed action');
    const idempotencyKey = crypto.randomUUID();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const confirmed = await apiAfterRestart.inject({
        method: 'POST',
        url: `/api/v1/actions/${action.id}/confirm`,
        payload: { expectedRevision: action.revision, idempotencyKey },
      });
      expect(confirmed.statusCode).toBe(200);
    }
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const executed = await apiAfterRestart.inject({
        method: 'POST',
        url: `/api/v1/actions/${action.id}/execution-result`,
        payload: {
          idempotencyKey,
          status: 'succeeded',
          nativeRecordRef: 'native-calendar-record-1',
          deviceContext: {
            possibleDuplicateContactCount: 0,
            calendarConflictCount: 2,
          },
        },
      });
      expect(executed.statusCode).toBe(200);
    }

    const retryableAction = intake.actions.find((item) => item.type === 'create_contact');
    if (!retryableAction) {
      throw new Error('Expected a retryable contact action');
    }
    const confirmationKey = crypto.randomUUID();
    const failedExecutionKey = crypto.randomUUID();
    const successfulExecutionKey = crypto.randomUUID();
    const retryConfirmation = await apiAfterRestart.inject({
      method: 'POST',
      url: `/api/v1/actions/${retryableAction.id}/confirm`,
      payload: {
        expectedRevision: retryableAction.revision,
        idempotencyKey: confirmationKey,
      },
    });
    expect(retryConfirmation.statusCode).toBe(200);
    const failedExecution = await apiAfterRestart.inject({
      method: 'POST',
      url: `/api/v1/actions/${retryableAction.id}/execution-result`,
      payload: {
        idempotencyKey: failedExecutionKey,
        confirmationIdempotencyKey: confirmationKey,
        status: 'failed',
        errorMessage: 'CONTACT_WRITE_FAILED',
        deviceContext: {
          possibleDuplicateContactCount: 1,
          calendarConflictCount: 0,
        },
      },
    });
    expect(failedExecution.json<{ status: string }>().status).toBe('failed');
    const successfulRetry = await apiAfterRestart.inject({
      method: 'POST',
      url: `/api/v1/actions/${retryableAction.id}/execution-result`,
      payload: {
        idempotencyKey: successfulExecutionKey,
        confirmationIdempotencyKey: confirmationKey,
        status: 'succeeded',
        nativeRecordRef: 'native-contact-record-1',
        deviceContext: {
          possibleDuplicateContactCount: 1,
          calendarConflictCount: 0,
        },
      },
    });
    expect(successfulRetry.json<{ status: string }>().status).toBe('succeeded');
    await apiAfterRestart.close();

    const suggestionWorkerStore = new PrismaIntakeStore(createPrismaClient(databaseUrl));
    const suggestionWorker = createIntakeService(config, {
      store: suggestionWorkerStore,
      inlineWorker: false,
    });
    expect(await suggestionWorker.service.processNextJob('suggestion-integration-worker')).toBe(
      true,
    );
    await suggestionWorkerStore.close();

    expect(await prisma.actionConfirmation.count({ where: { idempotencyKey } })).toBe(1);
    expect(await prisma.actionExecution.count({ where: { idempotencyKey } })).toBe(1);
    expect(
      await prisma.actionExecution.count({
        where: { idempotencyKey: { in: [failedExecutionKey, successfulExecutionKey] } },
      }),
    ).toBe(2);
    expect(await prisma.actionRevision.count({ where: { actionId: action.id } })).toBe(1);
    expect(await prisma.modelRun.count({ where: { intakeId: id } })).toBe(3);
    expect(await prisma.modelRun.count({ where: { intakeId: id, stage: 'insight' } })).toBe(1);
    const finishedJob = await prisma.analysisJob.findUniqueOrThrow({ where: { intakeId: id } });
    expect(finishedJob.status).toBe('succeeded');
    expect(finishedJob.imagePayload).toBeNull();
    const execution = await prisma.actionExecution.findUniqueOrThrow({
      where: { idempotencyKey },
    });
    expect(execution.nativeRecordRef).toMatch(/^sha256:/);
    expect(execution.nativeRecordRef).not.toContain('native-calendar-record-1');
    expect(execution.deviceContext).toEqual({
      possibleDuplicateContactCount: 0,
      calendarConflictCount: 2,
    });

    const insights = await prisma.insight.findMany({ where: { intakeId: id } });
    expect(insights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'observation', type: 'schedule_conflict' }),
        expect.objectContaining({ kind: 'observation', type: 'duplicate_contact' }),
        expect.objectContaining({ kind: 'suggestion', type: 'meeting_preparation' }),
        expect.objectContaining({ kind: 'suggestion', generator: 'model' }),
      ]),
    );
    expect(await prisma.suggestionJob.findUniqueOrThrow({ where: { intakeId: id } })).toMatchObject(
      { status: 'succeeded', generation: 2 },
    );

    const apiSecondRestart = await buildApp({ config, logger: false, inlineWorker: false });
    const history = await apiSecondRestart.inject({ method: 'GET', url: '/api/v1/history' });
    expect(history.statusCode).toBe(200);
    expect(history.json<{ items: Array<{ id: string }> }>().items.map((item) => item.id)).toContain(
      id,
    );
    const persistedInsights = await apiSecondRestart.inject({
      method: 'GET',
      url: `/api/v1/intakes/${id}/insights`,
    });
    const persistedInsightResponse = persistedInsights.json<InsightResponse>();
    expect(persistedInsightResponse.generationStatus).toBe('ready');
    expect(persistedInsightResponse.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'schedule_conflict', kind: 'observation' }),
        expect.objectContaining({ type: 'duplicate_contact', kind: 'observation' }),
      ]),
    );

    const activity = await apiSecondRestart.inject({
      method: 'GET',
      url: `/api/v1/intakes/${id}/activity`,
    });
    expect(activity.json<{ items: ActivityEvent[] }>().items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'analysis_completed', source: 'ai' }),
        expect.objectContaining({ type: 'action_revised', source: 'ai', revision: 1 }),
        expect.objectContaining({ type: 'action_confirmed', actionId: action.id }),
        expect.objectContaining({ type: 'execution_succeeded', actionId: action.id }),
      ]),
    );

    const deleted = await apiSecondRestart.inject({
      method: 'DELETE',
      url: `/api/v1/intakes/${id}`,
    });
    expect(deleted.statusCode).toBe(204);
    const actionIds = intake.actions.map((item) => item.id);
    expect(
      await Promise.all([
        prisma.intake.count({ where: { id } }),
        prisma.action.count({ where: { intakeId: id } }),
        prisma.actionRevision.count({ where: { actionId: { in: actionIds } } }),
        prisma.actionConfirmation.count({ where: { actionId: { in: actionIds } } }),
        prisma.actionExecution.count({ where: { actionId: { in: actionIds } } }),
        prisma.insight.count({ where: { intakeId: id } }),
        prisma.modelRun.count({ where: { intakeId: id } }),
        prisma.analysisJob.count({ where: { intakeId: id } }),
        prisma.suggestionJob.count({ where: { intakeId: id } }),
      ]),
    ).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(
      (
        await apiSecondRestart.inject({ method: 'GET', url: '/api/v1/data-summary' })
      ).json<DataSummary>(),
    ).toMatchObject({ intakes: 0, actions: 0, executionResults: 0, insights: 0 });
    await apiSecondRestart.close();
  });

  it('reclaims a job abandoned by a crashed worker lease', async () => {
    const api = await buildApp({ config, logger: false, inlineWorker: false });
    const upload = multipartScreenshot('后天下午再见。');
    const created = await api.inject({
      method: 'POST',
      url: '/api/v1/intakes',
      headers: { 'content-type': upload.contentType },
      payload: upload.payload,
    });
    const { id } = created.json<{ id: string }>();
    await api.close();

    const crashedStore = new PrismaIntakeStore(createPrismaClient(databaseUrl));
    const claimed = await crashedStore.claimAnalysisJob('crashed-worker', 60_000);
    expect(claimed?.intakeId).toBe(id);
    await crashedStore.close();

    const recoveryStore = new PrismaIntakeStore(createPrismaClient(databaseUrl));
    const recovery = createIntakeService(config, { store: recoveryStore, inlineWorker: false });
    expect(await recovery.service.processNextJob('replacement-worker', 0)).toBe(true);
    const recovered = await recoveryStore.get(id);
    expect(recovered?.status).toBe('ready');
    await recoveryStore.close();

    const job = await prisma.analysisJob.findUniqueOrThrow({ where: { intakeId: id } });
    expect(job.status).toBe('succeeded');
    expect(job.attempts).toBe(2);
    expect(job.imagePayload).toBeNull();
  });
});
