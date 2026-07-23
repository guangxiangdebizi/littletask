import { createHash, randomUUID } from 'node:crypto';

import { PrismaPg } from '@prisma/adapter-pg';
import {
  actionStatusSchema,
  actionTypeSchema,
  activityEventSchema,
  actionCardSchema,
  dataSummarySchema,
  executionDeviceContextSchema,
  groundedSuggestionInputSchema,
  historyItemSchema,
  insightSchema,
  intakeSchema,
  type ActivityEvent,
  type DataSummary,
  type GroundedSuggestionInput,
  type Insight,
  type Intake,
} from '@littletask/contracts';

import { Prisma, PrismaClient } from '../generated/prisma/client';
import { historyOutcome, summarizeActions } from '../history';
import type {
  AnalyzeInput,
  AuthPrincipal,
  ClaimedAnalysisJob,
  ClaimedSuggestionJob,
  DeviceSessionInput,
  ExecutionRecordInput,
  ExecutionRecord,
  ExecutionObservation,
  HistoryCursor,
  HistoryStorePage,
  IntakeStore,
  ModelRunRecord,
  SuggestionJobState,
} from '../types';

const intakeInclude = {
  actions: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.IntakeInclude;

type IntakeRow = Prisma.IntakeGetPayload<{ include: typeof intakeInclude }>;

interface ClaimedJobRow {
  id: string;
  intake_id: string;
  image_payload: Uint8Array;
  mime_type: string;
  context_now: Date;
  attempts: number;
  max_attempts: number;
}

interface ExhaustedJobRow {
  intake_id: string;
}

interface ClaimedSuggestionJobRow {
  id: string;
  intake_id: string;
  generation: number;
  input: unknown;
  attempts: number;
  max_attempts: number;
}

interface LockedSuggestionJobRow {
  id: string;
  intake_id: string;
  generation: number;
  input_hash: string;
  status: 'queued' | 'processing' | 'retry' | 'succeeded' | 'failed';
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function toDomainIntake(row: IntakeRow): Intake {
  return intakeSchema.parse({
    id: row.id,
    status: row.status,
    note: row.note,
    locale: row.locale,
    timezone: row.timezone,
    image: {
      sha256: row.imageSha256,
      mimeType: row.imageMimeType,
      bytes: row.imageBytes,
      originalName: row.imageOriginalName,
    },
    summary: row.summary,
    participants: row.participants,
    facts: row.facts,
    uncertainties: row.uncertainties,
    clarifyingQuestions: row.clarifyingQuestions,
    actions: row.actions.map((action) =>
      actionCardSchema.parse({
        id: action.id,
        type: action.type,
        status: action.status,
        revision: action.revision,
        confidence: action.confidence,
        evidence: action.evidence,
        assumptions: action.assumptions,
        payload: action.payload,
        createdAt: action.createdAt.toISOString(),
        updatedAt: action.updatedAt.toISOString(),
      }),
    ),
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

export function createPrismaClient(databaseUrl: string): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    max: 10,
  });
  return new PrismaClient({ adapter });
}

export class PrismaIntakeStore implements IntakeStore {
  constructor(private readonly prisma: PrismaClient) {}

  async createDeviceSession(input: DeviceSessionInput): Promise<void> {
    await this.prisma.user.create({
      data: {
        id: input.userId,
        createdAt: input.createdAt,
        devices: {
          create: {
            id: input.deviceId,
            tokenHash: input.tokenHash,
            createdAt: input.createdAt,
            lastSeenAt: input.createdAt,
          },
        },
      },
    });
  }

  async findDeviceSession(tokenHash: string): Promise<AuthPrincipal | undefined> {
    const session = await this.prisma.deviceSession.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, revokedAt: true, lastSeenAt: true },
    });
    if (!session || session.revokedAt) return undefined;
    if (session.lastSeenAt.getTime() < Date.now() - 5 * 60_000) {
      await this.prisma.deviceSession.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { lastSeenAt: new Date() },
      });
    }
    return { userId: session.userId, deviceId: session.id };
  }

  async revokeDeviceSession(deviceId: string): Promise<void> {
    await this.prisma.deviceSession.updateMany({
      where: { id: deviceId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async deleteUser(userId: string): Promise<boolean> {
    const result = await this.prisma.user.deleteMany({ where: { id: userId } });
    return result.count > 0;
  }

  async create(
    userId: string,
    intake: Intake,
    analysisInput: AnalyzeInput,
    maxAttempts: number,
  ): Promise<void> {
    await this.prisma.intake.create({
      data: {
        id: intake.id,
        userId,
        status: intake.status,
        note: intake.note,
        locale: intake.locale,
        timezone: intake.timezone,
        imageSha256: intake.image.sha256,
        imageMimeType: intake.image.mimeType,
        imageBytes: intake.image.bytes,
        imageOriginalName: intake.image.originalName,
        summary: intake.summary,
        participants: json(intake.participants),
        facts: json(intake.facts),
        uncertainties: json(intake.uncertainties),
        clarifyingQuestions: json(intake.clarifyingQuestions),
        error: Prisma.DbNull,
        createdAt: new Date(intake.createdAt),
        updatedAt: new Date(intake.updatedAt),
        job: {
          create: {
            id: randomUUID(),
            status: 'queued',
            imagePayload: Uint8Array.from(analysisInput.image),
            mimeType: analysisInput.mimeType,
            contextNow: analysisInput.now,
            attempts: 0,
            maxAttempts,
            availableAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
      },
    });
  }

  async get(userId: string, id: string): Promise<Intake | undefined> {
    const row = await this.prisma.intake.findFirst({
      where: { id, userId },
      include: intakeInclude,
    });
    return row ? toDomainIntake(row) : undefined;
  }

  async list(userId: string): Promise<Intake[]> {
    const rows = await this.prisma.intake.findMany({
      where: { userId },
      include: intakeInclude,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toDomainIntake);
  }

  async listHistory(
    userId: string,
    input: { limit: number; before?: HistoryCursor },
  ): Promise<HistoryStorePage> {
    const beforeDate = input.before ? new Date(input.before.createdAt) : null;
    const rows = await this.prisma.intake.findMany({
      where: {
        userId,
        ...(input.before && beforeDate
          ? {
              OR: [
                { createdAt: { lt: beforeDate } },
                { createdAt: beforeDate, id: { lt: input.before.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
      select: {
        id: true,
        status: true,
        summary: true,
        createdAt: true,
        updatedAt: true,
        actions: { select: { status: true } },
      },
    });
    const items = rows.slice(0, input.limit).map((row) => {
      const actions = summarizeActions(
        actionStatusSchema.array().parse(row.actions.map((action) => action.status)),
      );
      return historyItemSchema.parse({
        id: row.id,
        status: row.status,
        summary: row.summary,
        outcome: historyOutcome(row.status, actions),
        actions,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      });
    });
    return { items, hasMore: rows.length > input.limit };
  }

  async listActivity(userId: string, intakeId: string): Promise<ActivityEvent[]> {
    const intake = await this.prisma.intake.findFirst({
      where: { id: intakeId, userId },
      select: { id: true, status: true, createdAt: true },
    });
    if (!intake) return [];
    const [revisions, confirmations, executions, latestModelRun] = await Promise.all([
      this.prisma.actionRevision.findMany({
        where: { action: { intakeId } },
        include: { action: { select: { type: true } } },
      }),
      this.prisma.actionConfirmation.findMany({
        where: { action: { intakeId } },
        include: { action: { select: { type: true } } },
      }),
      this.prisma.actionExecution.findMany({
        where: { action: { intakeId } },
        include: { action: { select: { type: true } } },
      }),
      this.prisma.modelRun.findFirst({
        where: { intakeId, intake: { userId }, stage: { in: ['analysis', 'review'] } },
        orderBy: { completedAt: 'desc' },
      }),
    ]);

    const events: ActivityEvent[] = [
      activityEventSchema.parse({
        id: intake.id,
        type: 'intake_created',
        source: 'user',
        occurredAt: intake.createdAt.toISOString(),
      }),
    ];
    if (latestModelRun && ['ready', 'failed'].includes(intake.status)) {
      events.push(
        activityEventSchema.parse({
          id: latestModelRun.id,
          type: intake.status === 'ready' ? 'analysis_completed' : 'analysis_failed',
          source: 'ai',
          ...(latestModelRun.errorCode ? { errorCode: latestModelRun.errorCode } : {}),
          occurredAt: latestModelRun.completedAt.toISOString(),
        }),
      );
    }
    for (const revision of revisions) {
      events.push(
        activityEventSchema.parse({
          id: revision.id,
          type: 'action_revised',
          source: revision.source,
          actionId: revision.actionId,
          actionType: actionTypeSchema.parse(revision.action.type),
          revision: revision.revision,
          occurredAt: revision.createdAt.toISOString(),
        }),
      );
    }
    for (const confirmation of confirmations) {
      events.push(
        activityEventSchema.parse({
          id: confirmation.id,
          type: 'action_confirmed',
          source: 'user',
          actionId: confirmation.actionId,
          actionType: actionTypeSchema.parse(confirmation.action.type),
          revision: confirmation.revision,
          occurredAt: confirmation.confirmedAt.toISOString(),
        }),
      );
    }
    for (const execution of executions) {
      const errorCode = this.safeErrorCode(execution.errorMessage);
      events.push(
        activityEventSchema.parse({
          id: execution.id,
          type: execution.status === 'succeeded' ? 'execution_succeeded' : 'execution_failed',
          source: 'device',
          actionId: execution.actionId,
          actionType: actionTypeSchema.parse(execution.action.type),
          ...(errorCode ? { errorCode } : {}),
          occurredAt: execution.createdAt.toISOString(),
        }),
      );
    }
    return events
      .toSorted((left, right) => right.occurredAt.localeCompare(left.occurredAt))
      .slice(0, 200);
  }

  async getDataSummary(userId: string): Promise<DataSummary> {
    const [intakes, actions, executionResults, insights, temporaryScreenshots] = await Promise.all([
      this.prisma.intake.count({ where: { userId } }),
      this.prisma.action.count({ where: { intake: { userId } } }),
      this.prisma.actionExecution.count({ where: { action: { intake: { userId } } } }),
      this.prisma.insight.count({ where: { intake: { userId } } }),
      this.prisma.analysisJob.count({
        where: { intake: { userId }, imagePayload: { not: null } },
      }),
    ]);
    return dataSummarySchema.parse({
      intakes,
      actions,
      executionResults,
      insights,
      temporaryScreenshots,
      screenshotsRetainedAfterAnalysis: false,
    });
  }

  async replace(
    userId: string,
    intake: Intake,
    revisionSource: 'ai' | 'user' | 'system' = 'system',
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.intake.updateMany({
        where: { id: intake.id, userId },
        data: {
          status: intake.status,
          note: intake.note,
          locale: intake.locale,
          timezone: intake.timezone,
          summary: intake.summary,
          participants: json(intake.participants),
          facts: json(intake.facts),
          uncertainties: json(intake.uncertainties),
          clarifyingQuestions: json(intake.clarifyingQuestions),
          error: intake.error === null ? Prisma.DbNull : json(intake.error),
          updatedAt: new Date(intake.updatedAt),
        },
      });
      if (result.count !== 1) throw new Error(`Intake not found: ${intake.id}`);

      for (const action of intake.actions) {
        await transaction.action.upsert({
          where: { id: action.id },
          create: {
            id: action.id,
            intakeId: intake.id,
            type: action.type,
            status: action.status,
            revision: action.revision,
            confidence: action.confidence,
            evidence: json(action.evidence),
            assumptions: json(action.assumptions),
            payload: json(action.payload),
            createdAt: new Date(action.createdAt),
            updatedAt: new Date(action.updatedAt),
          },
          update: {
            status: action.status,
            revision: action.revision,
            confidence: action.confidence,
            evidence: json(action.evidence),
            assumptions: json(action.assumptions),
            payload: json(action.payload),
            updatedAt: new Date(action.updatedAt),
          },
        });
        await transaction.actionRevision.upsert({
          where: { actionId_revision: { actionId: action.id, revision: action.revision } },
          create: {
            id: randomUUID(),
            actionId: action.id,
            revision: action.revision,
            source: revisionSource,
            snapshot: json(action),
            createdAt: new Date(action.updatedAt),
          },
          update: {},
        });
      }
    });
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const result = await this.prisma.intake.deleteMany({ where: { id, userId } });
    return result.count > 0;
  }

  async deleteAll(userId: string): Promise<number> {
    const result = await this.prisma.intake.deleteMany({ where: { userId } });
    return result.count;
  }

  async getInsights(userId: string, intakeId: string): Promise<Insight[]> {
    const rows = await this.prisma.insight.findMany({
      where: { intakeId, intake: { userId } },
      orderBy: { createdAt: 'asc' },
    });
    return insightSchema.array().parse(
      rows.map((row) => ({
        id: row.id,
        intakeId: row.intakeId,
        actionId: row.actionId ?? undefined,
        type: row.type,
        kind: row.kind,
        generator: row.generator,
        priority: row.priority,
        title: row.title,
        body: row.body,
        evidence: row.evidence,
        createdAt: row.createdAt.toISOString(),
      })),
    );
  }

  async setRuleInsights(userId: string, intakeId: string, insights: Insight[]): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const intake = await transaction.intake.findFirst({ where: { id: intakeId, userId } });
      if (!intake) throw new Error(`Intake not found: ${intakeId}`);
      await transaction.insight.deleteMany({ where: { intakeId, generator: 'rules' } });
      const ruleInsights = insights.filter((insight) => insight.generator === 'rules');
      if (ruleInsights.length === 0) return;
      await transaction.insight.createMany({
        data: ruleInsights.map((insight) => ({
          id: insight.id,
          intakeId,
          actionId: insight.actionId ?? null,
          type: insight.type,
          kind: insight.kind,
          generator: insight.generator,
          priority: insight.priority,
          title: insight.title,
          body: insight.body,
          evidence: json(insight.evidence),
          createdAt: new Date(insight.createdAt),
        })),
      });
    });
  }

  async enqueueSuggestionJob(
    userId: string,
    input: GroundedSuggestionInput,
    inputHash: string,
    maxAttempts: number,
  ): Promise<boolean> {
    const parsedInput = groundedSuggestionInputSchema.parse(input);
    if (!/^[a-f0-9]{64}$/.test(inputHash)) {
      throw new Error('Suggestion input hash must be a lowercase SHA-256 value');
    }
    return this.prisma.$transaction(async (transaction) => {
      const intake = await transaction.intake.findUnique({
        where: { id: parsedInput.intakeId, userId },
        select: { userId: true },
      });
      if (!intake) throw new Error(`Intake not found: ${parsedInput.intakeId}`);
      const rows = await transaction.$queryRaw<LockedSuggestionJobRow[]>(Prisma.sql`
        SELECT "id", "intake_id", "generation", "input_hash", "status"
        FROM "suggestion_jobs"
        WHERE "intake_id" = ${parsedInput.intakeId}::uuid
        FOR UPDATE
      `);
      const existing = rows[0];
      if (existing?.input_hash === inputHash && existing.status !== 'failed') return false;

      const now = new Date();
      const generation = (existing?.generation ?? 0) + 1;
      if (existing) {
        await transaction.suggestionJob.update({
          where: { id: existing.id },
          data: {
            status: 'queued',
            generation,
            inputHash,
            input: json(parsedInput),
            attempts: 0,
            maxAttempts,
            availableAt: now,
            lockedAt: null,
            lockedBy: null,
            lastErrorCode: null,
            completedAt: null,
            updatedAt: now,
          },
        });
      } else {
        await transaction.suggestionJob.create({
          data: {
            id: randomUUID(),
            intakeId: parsedInput.intakeId,
            status: 'queued',
            generation,
            inputHash,
            input: json(parsedInput),
            attempts: 0,
            maxAttempts,
            availableAt: now,
            createdAt: now,
            updatedAt: now,
          },
        });
      }
      await transaction.insight.deleteMany({
        where: { intakeId: parsedInput.intakeId, generator: 'model' },
      });
      return true;
    });
  }

  async getSuggestionJobState(userId: string, intakeId: string): Promise<SuggestionJobState> {
    const job = await this.prisma.suggestionJob.findFirst({
      where: { intakeId, intake: { userId } },
      select: { status: true, generation: true },
    });
    if (!job) return { status: 'not_requested', generation: null };
    const statuses = {
      queued: 'queued',
      retry: 'queued',
      processing: 'processing',
      succeeded: 'ready',
      failed: 'failed',
    } as const;
    return { status: statuses[job.status], generation: job.generation };
  }

  async claimSuggestionJob(
    workerId: string,
    staleAfterMs: number,
  ): Promise<ClaimedSuggestionJob | null> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw(Prisma.sql`
        UPDATE "suggestion_jobs"
        SET
          "status" = 'failed'::"AnalysisJobStatus",
          "locked_at" = NULL,
          "locked_by" = NULL,
          "last_error_code" = 'JOB_LEASE_EXHAUSTED',
          "completed_at" = NOW(),
          "updated_at" = NOW()
        WHERE
          "status" = 'processing'::"AnalysisJobStatus"
          AND "locked_at" <= NOW() - (${staleAfterMs} * INTERVAL '1 millisecond')
          AND "attempts" >= "max_attempts"
      `);

      const rows = await transaction.$queryRaw<ClaimedSuggestionJobRow[]>(Prisma.sql`
        WITH candidate AS (
          SELECT "id"
          FROM "suggestion_jobs"
          WHERE
            "attempts" < "max_attempts"
            AND (
              (
                "status" IN (
                  'queued'::"AnalysisJobStatus",
                  'retry'::"AnalysisJobStatus"
                )
                AND "available_at" <= NOW()
              )
              OR (
                "status" = 'processing'::"AnalysisJobStatus"
                AND "locked_at" <= NOW() - (${staleAfterMs} * INTERVAL '1 millisecond')
              )
            )
          ORDER BY "available_at", "created_at"
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        UPDATE "suggestion_jobs" AS job
        SET
          "status" = 'processing'::"AnalysisJobStatus",
          "attempts" = job."attempts" + 1,
          "locked_at" = NOW(),
          "locked_by" = ${workerId},
          "updated_at" = NOW()
        FROM candidate
        WHERE job."id" = candidate."id"
        RETURNING
          job."id",
          job."intake_id",
          job."generation",
          job."input",
          job."attempts",
          job."max_attempts"
      `);
      const row = rows[0];
      if (!row) return null;
      const parsedInput = groundedSuggestionInputSchema.safeParse(row.input);
      if (!parsedInput.success || parsedInput.data.intakeId !== row.intake_id) {
        await transaction.suggestionJob.update({
          where: { id: row.id },
          data: {
            status: 'failed',
            lockedAt: null,
            lockedBy: null,
            lastErrorCode: 'SUGGESTION_INPUT_INVALID',
            completedAt: new Date(),
            updatedAt: new Date(),
          },
        });
        return null;
      }
      const intake = await transaction.intake.findUnique({
        where: { id: row.intake_id },
        select: { userId: true },
      });
      if (!intake) return null;
      return {
        ...parsedInput.data,
        jobId: row.id,
        userId: intake.userId,
        generation: row.generation,
        attempt: row.attempts,
        maxAttempts: row.max_attempts,
      };
    });
  }

  async completeSuggestionJob(
    jobId: string,
    generation: number,
    insights: Insight[],
  ): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const rows = await transaction.$queryRaw<LockedSuggestionJobRow[]>(Prisma.sql`
        SELECT "id", "intake_id", "generation", "input_hash", "status"
        FROM "suggestion_jobs"
        WHERE "id" = ${jobId}::uuid
        FOR UPDATE
      `);
      const job = rows[0];
      if (!job || job.generation !== generation || job.status !== 'processing') return false;

      await transaction.insight.deleteMany({
        where: { intakeId: job.intake_id, generator: 'model' },
      });
      const modelInsights = insights.filter((insight) => insight.generator === 'model');
      if (modelInsights.length > 0) {
        await transaction.insight.createMany({
          data: modelInsights.map((insight) => ({
            id: insight.id,
            intakeId: job.intake_id,
            actionId: insight.actionId ?? null,
            type: insight.type,
            kind: insight.kind,
            generator: insight.generator,
            priority: insight.priority,
            title: insight.title,
            body: insight.body,
            evidence: json(insight.evidence),
            createdAt: new Date(insight.createdAt),
          })),
        });
      }
      await transaction.suggestionJob.update({
        where: { id: job.id },
        data: {
          status: 'succeeded',
          lockedAt: null,
          lockedBy: null,
          lastErrorCode: null,
          completedAt: new Date(),
          updatedAt: new Date(),
        },
      });
      return true;
    });
  }

  async rescheduleSuggestionJob(
    jobId: string,
    generation: number,
    delayMs: number,
    errorCode: string,
  ): Promise<void> {
    await this.prisma.suggestionJob.updateMany({
      where: { id: jobId, generation },
      data: {
        status: 'retry',
        availableAt: new Date(Date.now() + delayMs),
        lockedAt: null,
        lockedBy: null,
        lastErrorCode: errorCode,
        updatedAt: new Date(),
      },
    });
  }

  async failSuggestionJob(jobId: string, generation: number, errorCode: string): Promise<void> {
    await this.prisma.suggestionJob.updateMany({
      where: { id: jobId, generation },
      data: {
        status: 'failed',
        lockedAt: null,
        lockedBy: null,
        lastErrorCode: errorCode,
        completedAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  async rememberConfirmation(
    userId: string,
    idempotencyKey: string,
    actionId: string,
    revision: number,
  ): Promise<string> {
    const action = await this.prisma.action.findFirst({
      where: { id: actionId, intake: { userId } },
      select: { id: true },
    });
    if (!action) throw new Error(`Action not found: ${actionId}`);
    const row = await this.prisma.actionConfirmation.upsert({
      where: { idempotencyKey },
      create: {
        id: randomUUID(),
        actionId,
        revision,
        idempotencyKey,
        confirmedAt: new Date(),
      },
      update: { idempotencyKey },
    });
    return row.actionId;
  }

  async getConfirmation(userId: string, idempotencyKey: string): Promise<string | undefined> {
    const row = await this.prisma.actionConfirmation.findFirst({
      where: { idempotencyKey, action: { intake: { userId } } },
      select: { actionId: true },
    });
    return row?.actionId;
  }

  async getExecution(userId: string, idempotencyKey: string): Promise<ExecutionRecord | undefined> {
    const row = await this.prisma.actionExecution.findFirst({
      where: { idempotencyKey, action: { intake: { userId } } },
      select: { actionId: true, status: true },
    });
    return row ?? undefined;
  }

  async recordExecution(userId: string, input: ExecutionRecordInput): Promise<ExecutionRecord> {
    const action = await this.prisma.action.findFirst({
      where: { id: input.actionId, intake: { userId } },
      select: { id: true },
    });
    if (!action) throw new Error(`Action not found: ${input.actionId}`);
    const nativeRecordRef = input.nativeRecordRef
      ? `sha256:${createHash('sha256').update(input.nativeRecordRef).digest('hex')}`
      : null;
    const row = await this.prisma.actionExecution.upsert({
      where: { idempotencyKey: input.idempotencyKey },
      create: {
        id: randomUUID(),
        actionId: input.actionId,
        idempotencyKey: input.idempotencyKey,
        status: input.status,
        nativeRecordRef,
        errorMessage: input.errorMessage ?? null,
        deviceContext: input.deviceContext ? json(input.deviceContext) : Prisma.DbNull,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      update: { idempotencyKey: input.idempotencyKey },
    });
    return { actionId: row.actionId, status: row.status };
  }

  async listExecutionObservations(
    userId: string,
    intakeId: string,
  ): Promise<ExecutionObservation[]> {
    const rows = await this.prisma.actionExecution.findMany({
      where: { action: { intakeId, intake: { userId } } },
      orderBy: { createdAt: 'asc' },
      select: {
        actionId: true,
        status: true,
        deviceContext: true,
        errorMessage: true,
        createdAt: true,
      },
    });
    return rows.map((row) => ({
      actionId: row.actionId,
      status: row.status,
      deviceContext: executionDeviceContextSchema.parse(
        row.deviceContext ?? {
          possibleDuplicateContactCount: 0,
          calendarConflictCount: 0,
          relatedContacts: [],
        },
      ),
      errorCode:
        row.errorMessage && /^[A-Z][A-Z0-9_]{1,79}$/.test(row.errorMessage)
          ? row.errorMessage
          : null,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async claimAnalysisJob(
    workerId: string,
    staleAfterMs: number,
  ): Promise<ClaimedAnalysisJob | null> {
    return this.prisma.$transaction(async (transaction) => {
      const exhausted = await transaction.$queryRaw<ExhaustedJobRow[]>(Prisma.sql`
        UPDATE "analysis_jobs"
        SET
          "status" = 'failed'::"AnalysisJobStatus",
          "image_payload" = NULL,
          "locked_at" = NULL,
          "locked_by" = NULL,
          "last_error_code" = 'JOB_LEASE_EXHAUSTED',
          "completed_at" = NOW(),
          "updated_at" = NOW()
        WHERE
          "status" = 'processing'::"AnalysisJobStatus"
          AND "locked_at" <= NOW() - (${staleAfterMs} * INTERVAL '1 millisecond')
          AND "attempts" >= "max_attempts"
        RETURNING "intake_id"
      `);
      for (const row of exhausted) {
        await transaction.intake.update({
          where: { id: row.intake_id },
          data: {
            status: 'failed',
            error: json({
              code: 'JOB_LEASE_EXHAUSTED',
              message: 'Analysis worker stopped before completing the job',
            }),
            updatedAt: new Date(),
          },
        });
      }

      const rows = await transaction.$queryRaw<ClaimedJobRow[]>(Prisma.sql`
        WITH candidate AS (
          SELECT "id"
          FROM "analysis_jobs"
          WHERE
            "image_payload" IS NOT NULL
            AND "attempts" < "max_attempts"
            AND (
              (
                "status" IN (
                  'queued'::"AnalysisJobStatus",
                  'retry'::"AnalysisJobStatus"
                )
                AND "available_at" <= NOW()
              )
              OR (
                "status" = 'processing'::"AnalysisJobStatus"
                AND "locked_at" <= NOW() - (${staleAfterMs} * INTERVAL '1 millisecond')
              )
            )
          ORDER BY "available_at", "created_at"
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        UPDATE "analysis_jobs" AS job
        SET
          "status" = 'processing'::"AnalysisJobStatus",
          "attempts" = job."attempts" + 1,
          "locked_at" = NOW(),
          "locked_by" = ${workerId},
          "updated_at" = NOW()
        FROM candidate
        WHERE job."id" = candidate."id"
        RETURNING
          job."id",
          job."intake_id",
          job."image_payload",
          job."mime_type",
          job."context_now",
          job."attempts",
          job."max_attempts"
      `);
      const row = rows[0];
      if (!row) return null;
      const intake = await transaction.intake.findUnique({ where: { id: row.intake_id } });
      if (!intake) return null;
      return {
        jobId: row.id,
        intakeId: row.intake_id,
        userId: intake.userId,
        image: Buffer.from(row.image_payload),
        mimeType: row.mime_type,
        note: intake.note,
        locale: intake.locale,
        timezone: intake.timezone,
        now: row.context_now,
        attempt: row.attempts,
        maxAttempts: row.max_attempts,
      };
    });
  }

  async completeAnalysisJob(jobId: string): Promise<void> {
    await this.prisma.analysisJob.updateMany({
      where: { id: jobId },
      data: {
        status: 'succeeded',
        imagePayload: null,
        lockedAt: null,
        lockedBy: null,
        lastErrorCode: null,
        completedAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  async rescheduleAnalysisJob(jobId: string, delayMs: number, errorCode: string): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const current = await transaction.analysisJob.findUnique({ where: { id: jobId } });
      if (!current) return;
      const job = await transaction.analysisJob.update({
        where: { id: current.id },
        data: {
          status: 'retry',
          availableAt: new Date(Date.now() + delayMs),
          lockedAt: null,
          lockedBy: null,
          lastErrorCode: errorCode,
          updatedAt: new Date(),
        },
      });
      await transaction.intake.updateMany({
        where: { id: job.intakeId },
        data: { status: 'queued', error: Prisma.DbNull, updatedAt: new Date() },
      });
    });
  }

  async failAnalysisJob(jobId: string, errorCode: string, message: string): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const current = await transaction.analysisJob.findUnique({ where: { id: jobId } });
      if (!current) return;
      const job = await transaction.analysisJob.update({
        where: { id: current.id },
        data: {
          status: 'failed',
          imagePayload: null,
          lockedAt: null,
          lockedBy: null,
          lastErrorCode: errorCode,
          completedAt: new Date(),
          updatedAt: new Date(),
        },
      });
      await transaction.intake.updateMany({
        where: { id: job.intakeId },
        data: {
          status: 'failed',
          error: json({ code: errorCode, message: message.slice(0, 500) }),
          updatedAt: new Date(),
        },
      });
    });
  }

  async recordModelRun(run: ModelRunRecord): Promise<void> {
    await this.prisma.modelRun.create({
      data: {
        id: run.id,
        intakeId: run.intakeId,
        stage: run.stage,
        status: run.status,
        provider: run.provider,
        model: run.model,
        reasoningEffort: run.reasoningEffort,
        promptVersion: run.promptVersion,
        schemaVersion: run.schemaVersion,
        durationMs: run.durationMs,
        inputTokens: run.inputTokens,
        outputTokens: run.outputTokens,
        totalTokens: run.totalTokens,
        responseId: run.responseId,
        errorCode: run.errorCode,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
      },
    });
  }

  async healthCheck(): Promise<void> {
    await this.prisma.$queryRaw`SELECT 1`;
  }

  async close(): Promise<void> {
    await this.prisma.$disconnect();
  }

  private safeErrorCode(value: string | null): string | undefined {
    return value && /^[A-Z][A-Z0-9_]{1,79}$/.test(value) ? value : undefined;
  }
}
