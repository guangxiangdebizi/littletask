import { createHash, randomUUID } from 'node:crypto';

import { PrismaPg } from '@prisma/adapter-pg';
import {
  actionCardSchema,
  insightSchema,
  intakeSchema,
  type Insight,
  type Intake,
} from '@littletask/contracts';

import { Prisma, PrismaClient } from '../generated/prisma/client';
import type {
  AnalyzeInput,
  ClaimedAnalysisJob,
  ExecutionRecordInput,
  IntakeStore,
  ModelRunRecord,
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

  async create(intake: Intake, analysisInput: AnalyzeInput, maxAttempts: number): Promise<void> {
    await this.prisma.intake.create({
      data: {
        id: intake.id,
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

  async get(id: string): Promise<Intake | undefined> {
    const row = await this.prisma.intake.findUnique({ where: { id }, include: intakeInclude });
    return row ? toDomainIntake(row) : undefined;
  }

  async list(): Promise<Intake[]> {
    const rows = await this.prisma.intake.findMany({
      include: intakeInclude,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toDomainIntake);
  }

  async replace(
    intake: Intake,
    revisionSource: 'ai' | 'user' | 'system' = 'system',
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.intake.update({
        where: { id: intake.id },
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

  async delete(id: string): Promise<boolean> {
    const result = await this.prisma.intake.deleteMany({ where: { id } });
    return result.count > 0;
  }

  async getInsights(intakeId: string): Promise<Insight[]> {
    const rows = await this.prisma.insight.findMany({
      where: { intakeId },
      orderBy: { createdAt: 'asc' },
    });
    return insightSchema.array().parse(
      rows.map((row) => ({
        id: row.id,
        intakeId: row.intakeId,
        actionId: row.actionId ?? undefined,
        type: row.type,
        priority: row.priority,
        title: row.title,
        body: row.body,
        evidence: row.evidence,
        createdAt: row.createdAt.toISOString(),
      })),
    );
  }

  async setInsights(intakeId: string, insights: Insight[]): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.insight.deleteMany({ where: { intakeId } });
      if (insights.length === 0) return;
      await transaction.insight.createMany({
        data: insights.map((insight) => ({
          id: insight.id,
          intakeId,
          actionId: insight.actionId ?? null,
          type: insight.type,
          priority: insight.priority,
          title: insight.title,
          body: insight.body,
          evidence: json(insight.evidence),
          createdAt: new Date(insight.createdAt),
        })),
      });
    });
  }

  async rememberConfirmation(
    idempotencyKey: string,
    actionId: string,
    revision: number,
  ): Promise<string> {
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

  async getConfirmation(idempotencyKey: string): Promise<string | undefined> {
    const row = await this.prisma.actionConfirmation.findUnique({
      where: { idempotencyKey },
      select: { actionId: true },
    });
    return row?.actionId;
  }

  async recordExecution(input: ExecutionRecordInput): Promise<string> {
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
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      update: { idempotencyKey: input.idempotencyKey },
    });
    return row.actionId;
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
    await this.prisma.analysisJob.update({
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
      const job = await transaction.analysisJob.update({
        where: { id: jobId },
        data: {
          status: 'retry',
          availableAt: new Date(Date.now() + delayMs),
          lockedAt: null,
          lockedBy: null,
          lastErrorCode: errorCode,
          updatedAt: new Date(),
        },
      });
      await transaction.intake.update({
        where: { id: job.intakeId },
        data: { status: 'queued', error: Prisma.DbNull, updatedAt: new Date() },
      });
    });
  }

  async failAnalysisJob(jobId: string, errorCode: string, message: string): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const job = await transaction.analysisJob.update({
        where: { id: jobId },
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
      await transaction.intake.update({
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
        errorCode: run.errorCode,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
      },
    });
  }

  async close(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
