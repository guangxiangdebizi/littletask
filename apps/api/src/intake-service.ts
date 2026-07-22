import { createHash, randomUUID } from 'node:crypto';

import {
  actionCardSchema,
  contactPayloadSchema,
  meetingPayloadSchema,
  updateContactPayloadSchema,
  type ActionCard,
  type ActionPatchRequest,
  type AnalysisDraft,
  type ExecutionResultRequest,
  type Intake,
} from '@littletask/contracts';
import { assertActionTransition, deriveInsights } from '@littletask/domain';

import type {
  AIProvider,
  AnalyzeInput,
  ClaimedAnalysisJob,
  IntakeStore,
  ModelRunRecord,
} from './types';

export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

interface CreateIntakeInput extends AnalyzeInput {
  originalName: string | null;
}

interface IntakeServiceOptions {
  inlineWorker: boolean;
  maxJobAttempts: number;
  jobLeaseMs: number;
  providerName: string;
  analysisModel: string;
  reviewModel: string;
  reasoningEffort: string;
  promptVersion: string;
  schemaVersion: string;
}

const defaultOptions: IntakeServiceOptions = {
  inlineWorker: true,
  maxJobAttempts: 3,
  jobLeaseMs: 5 * 60_000,
  providerName: 'fake',
  analysisModel: 'fake-analysis-v1',
  reviewModel: 'fake-review-v1',
  reasoningEffort: 'none',
  promptVersion: '2026-07-22.1',
  schemaVersion: '1',
};

const retryableAnalysisErrors = new Set([
  'MODEL_GATEWAY_ERROR',
  'MODEL_GATEWAY_UNAVAILABLE',
  'MODEL_RATE_LIMITED',
]);

export class IntakeService {
  private readonly options: IntakeServiceOptions;
  private inlineDrain: Promise<void> | null = null;

  constructor(
    private readonly store: IntakeStore,
    private readonly provider: AIProvider,
    options: Partial<IntakeServiceOptions> = {},
  ) {
    this.options = { ...defaultOptions, ...options };
  }

  async create(input: CreateIntakeInput): Promise<Intake> {
    const timestamp = new Date().toISOString();
    const intake: Intake = {
      id: randomUUID(),
      status: 'queued',
      note: input.note,
      locale: input.locale,
      timezone: input.timezone,
      image: {
        sha256: createHash('sha256').update(input.image).digest('hex'),
        mimeType: input.mimeType,
        bytes: input.image.byteLength,
        originalName: input.originalName,
      },
      summary: null,
      participants: [],
      facts: [],
      uncertainties: [],
      clarifyingQuestions: [],
      actions: [],
      error: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await this.store.create(intake, input, this.options.maxJobAttempts);
    if (this.options.inlineWorker) this.scheduleInlineWorker();
    return intake;
  }

  async get(id: string): Promise<Intake> {
    const intake = await this.store.get(id);
    if (!intake) {
      throw new DomainError('INTAKE_NOT_FOUND', 'Intake not found', 404);
    }
    return intake;
  }

  list(): Promise<Intake[]> {
    return this.store.list();
  }

  async delete(id: string): Promise<void> {
    if (!(await this.store.delete(id))) {
      throw new DomainError('INTAKE_NOT_FOUND', 'Intake not found', 404);
    }
  }

  async patchAction(actionId: string, request: ActionPatchRequest): Promise<ActionCard> {
    const { intake, actionIndex, action } = await this.findAction(actionId);
    if (!['draft', 'needs_input', 'ready'].includes(action.status)) {
      throw new DomainError('ACTION_LOCKED', 'Confirmed actions can no longer be edited', 409);
    }
    if (action.revision !== request.expectedRevision) {
      throw new DomainError('ACTION_REVISION_CONFLICT', 'Action revision is stale', 409);
    }

    const payload = this.parseActionPayload(action, request.payload);
    const updated = actionCardSchema.parse({
      ...action,
      payload,
      revision: action.revision + 1,
      status: 'ready',
      updatedAt: new Date().toISOString(),
    });
    const actions = [...intake.actions];
    actions[actionIndex] = updated;
    await this.store.replace({ ...intake, actions, updatedAt: updated.updatedAt }, 'user');
    return updated;
  }

  async confirmAction(
    actionId: string,
    expectedRevision: number,
    idempotencyKey: string,
  ): Promise<ActionCard> {
    const previousActionId = await this.store.getConfirmation(idempotencyKey);
    if (previousActionId && previousActionId !== actionId) {
      throw new DomainError(
        'IDEMPOTENCY_CONFLICT',
        'Idempotency key belongs to another action',
        409,
      );
    }

    const { intake, actionIndex, action } = await this.findAction(actionId);
    if (
      previousActionId &&
      ['confirmed', 'executing', 'succeeded', 'failed'].includes(action.status)
    ) {
      return action;
    }
    if (action.revision !== expectedRevision) {
      throw new DomainError('ACTION_REVISION_CONFLICT', 'Action revision is stale', 409);
    }
    assertActionTransition(action.status, 'confirmed');

    const storedActionId = await this.store.rememberConfirmation(
      idempotencyKey,
      actionId,
      action.revision,
    );
    if (storedActionId !== actionId) {
      throw new DomainError(
        'IDEMPOTENCY_CONFLICT',
        'Idempotency key belongs to another action',
        409,
      );
    }

    const updated = actionCardSchema.parse({
      ...action,
      status: 'confirmed',
      updatedAt: new Date().toISOString(),
    });
    const actions = [...intake.actions];
    actions[actionIndex] = updated;
    const nextIntake = { ...intake, actions, updatedAt: updated.updatedAt };
    await this.store.replace(nextIntake);
    await this.refreshDerivedInsights(nextIntake);
    return updated;
  }

  async reportExecution(actionId: string, request: ExecutionResultRequest): Promise<ActionCard> {
    const confirmedActionId = await this.store.getConfirmation(
      request.confirmationIdempotencyKey ?? request.idempotencyKey,
    );
    if (confirmedActionId !== actionId) {
      throw new DomainError(
        'ACTION_NOT_CONFIRMED',
        'Action must be confirmed before execution',
        409,
      );
    }

    const { intake, actionIndex, action } = await this.findAction(actionId);
    const existing = await this.store.getExecution(request.idempotencyKey);
    if (existing && (existing.actionId !== actionId || existing.status !== request.status)) {
      throw new DomainError(
        'IDEMPOTENCY_CONFLICT',
        'Idempotency key belongs to another execution result',
        409,
      );
    }
    if (action.status === 'succeeded' && request.status === 'failed') {
      if (existing) return action;
      throw new DomainError(
        'ACTION_STATE_CONFLICT',
        'Action cannot be executed in this state',
        409,
      );
    }

    if (action.status !== request.status) {
      try {
        assertActionTransition(action.status, 'executing');
        assertActionTransition('executing', request.status);
      } catch {
        throw new DomainError(
          'ACTION_STATE_CONFLICT',
          'Action cannot be executed in this state',
          409,
        );
      }
    }

    const recorded =
      existing ??
      (await this.store.recordExecution({
        actionId,
        idempotencyKey: request.idempotencyKey,
        status: request.status,
        ...(request.nativeRecordRef === undefined
          ? {}
          : { nativeRecordRef: request.nativeRecordRef }),
        ...(request.errorMessage === undefined ? {} : { errorMessage: request.errorMessage }),
        ...(request.deviceContext === undefined ? {} : { deviceContext: request.deviceContext }),
      }));
    if (recorded.actionId !== actionId || recorded.status !== request.status) {
      throw new DomainError(
        'IDEMPOTENCY_CONFLICT',
        'Idempotency key belongs to another execution result',
        409,
      );
    }
    if (action.status === request.status) {
      await this.refreshDerivedInsights(intake);
      return action;
    }

    const updated = actionCardSchema.parse({
      ...action,
      status: request.status,
      updatedAt: new Date().toISOString(),
    });
    const actions = [...intake.actions];
    actions[actionIndex] = updated;
    const nextIntake = { ...intake, actions, updatedAt: updated.updatedAt };
    await this.store.replace(nextIntake);
    await this.refreshDerivedInsights(nextIntake);
    return updated;
  }

  async getInsights(intakeId: string) {
    await this.get(intakeId);
    return this.store.getInsights(intakeId);
  }

  private async refreshDerivedInsights(intake: Intake): Promise<void> {
    const [relatedIntakes, executions] = await Promise.all([
      this.store.list(),
      this.store.listExecutionObservations(intake.id),
    ]);
    await this.store.setInsights(
      intake.id,
      deriveInsights(
        {
          intake,
          relatedIntakes: relatedIntakes.filter((candidate) => candidate.id !== intake.id),
          executions,
        },
        { createId: randomUUID, now: () => new Date() },
      ),
    );
  }

  async processNextJob(workerId: string, staleAfterMs = this.options.jobLeaseMs): Promise<boolean> {
    const job = await this.store.claimAnalysisJob(workerId, staleAfterMs);
    if (!job) return false;

    try {
      const current = await this.get(job.intakeId);
      if (current.status === 'ready') {
        await this.store.completeAnalysisJob(job.jobId);
        return true;
      }

      await this.store.replace({
        ...current,
        status: 'processing',
        error: null,
        updatedAt: new Date().toISOString(),
      });
      const draft = await this.runModelStage(job, 'analysis', () => this.provider.analyze(job));
      const reviewed = await this.runModelStage(job, 'review', () =>
        this.provider.review(job, draft),
      );
      const processing = await this.get(job.intakeId);
      await this.store.replace(this.materializeAnalysis(processing, reviewed), 'ai');
      await this.store.completeAnalysisJob(job.jobId);
    } catch (error) {
      const code = this.errorCode(error);
      if (retryableAnalysisErrors.has(code) && job.attempt < job.maxAttempts) {
        const delayMs = Math.min(5 * 60_000, 1_000 * 2 ** (job.attempt - 1));
        await this.store.rescheduleAnalysisJob(job.jobId, delayMs, code);
      } else {
        await this.store.failAnalysisJob(job.jobId, code, this.safeAnalysisMessage(error));
      }
    }
    return true;
  }

  private scheduleInlineWorker(): void {
    if (this.inlineDrain) return;
    this.inlineDrain = this.drainInlineJobs()
      .catch(() => undefined)
      .finally(() => {
        this.inlineDrain = null;
      });
  }

  private async drainInlineJobs(): Promise<void> {
    while (await this.processNextJob('inline-development-worker')) {
      // Drain all immediately available jobs; delayed retries are left for the next worker tick.
    }
  }

  private async runModelStage<T>(
    job: ClaimedAnalysisJob,
    stage: 'analysis' | 'review',
    run: () => Promise<T>,
  ): Promise<T> {
    const startedAt = new Date();
    const started = Date.now();
    try {
      const result = await run();
      await this.recordModelRun(job, stage, 'succeeded', startedAt, started, null);
      return result;
    } catch (error) {
      try {
        await this.recordModelRun(job, stage, 'failed', startedAt, started, this.errorCode(error));
      } catch {
        // Preserve the provider error; queue failure handling remains authoritative.
      }
      throw error;
    }
  }

  private recordModelRun(
    job: ClaimedAnalysisJob,
    stage: 'analysis' | 'review',
    status: ModelRunRecord['status'],
    startedAt: Date,
    started: number,
    errorCode: string | null,
  ): Promise<void> {
    return this.store.recordModelRun({
      id: randomUUID(),
      intakeId: job.intakeId,
      stage,
      status,
      provider: this.options.providerName,
      model: stage === 'analysis' ? this.options.analysisModel : this.options.reviewModel,
      reasoningEffort: this.options.reasoningEffort,
      promptVersion: this.options.promptVersion,
      schemaVersion: this.options.schemaVersion,
      durationMs: Math.max(0, Date.now() - started),
      errorCode,
      startedAt,
      completedAt: new Date(),
    });
  }

  private materializeAnalysis(intake: Intake, draft: AnalysisDraft): Intake {
    const timestamp = new Date().toISOString();
    const actions = draft.actions.map((proposal) =>
      actionCardSchema.parse({
        ...proposal,
        id: randomUUID(),
        revision: 1,
        status: proposal.confidence === 'low' ? 'needs_input' : 'ready',
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    );
    const clarifyingQuestions = draft.clarifyingQuestions.map((question) => ({
      id: randomUUID(),
      prompt: question.prompt,
      options: question.options,
      actionId: question.actionIndex === undefined ? undefined : actions[question.actionIndex]?.id,
    }));

    return {
      ...intake,
      status: 'ready',
      summary: draft.summary,
      participants: draft.participants,
      facts: draft.facts,
      uncertainties: draft.uncertainties,
      clarifyingQuestions,
      actions,
      error: null,
      updatedAt: timestamp,
    };
  }

  private async findAction(actionId: string): Promise<{
    intake: Intake;
    actionIndex: number;
    action: ActionCard;
  }> {
    for (const intake of await this.store.list()) {
      const actionIndex = intake.actions.findIndex((candidate) => candidate.id === actionId);
      if (actionIndex >= 0) {
        const action = intake.actions[actionIndex];
        if (action) return { intake, actionIndex, action };
      }
    }
    throw new DomainError('ACTION_NOT_FOUND', 'Action not found', 404);
  }

  private parseActionPayload(action: ActionCard, payload: unknown) {
    switch (action.type) {
      case 'create_event':
        return meetingPayloadSchema.parse(payload);
      case 'create_contact':
        return contactPayloadSchema.parse(payload);
      case 'update_contact':
        return updateContactPayloadSchema.parse(payload);
    }
  }

  private errorCode(error: unknown): string {
    if (typeof error === 'object' && error !== null && 'code' in error) {
      const code = String(error.code);
      if (/^[A-Z][A-Z0-9_]{1,79}$/.test(code)) return code;
    }
    return 'ANALYSIS_FAILED';
  }

  private safeAnalysisMessage(error: unknown): string {
    const code = this.errorCode(error);
    if (
      typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      code.startsWith('MODEL_')
    ) {
      return String(error.message).slice(0, 500);
    }
    return 'Analysis failed during validation or persistence';
  }
}
