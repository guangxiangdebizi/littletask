import { createHash, randomUUID } from 'node:crypto';

import {
  actionCardSchema,
  activityResponseSchema,
  clearAllDataResponseSchema,
  contactPayloadSchema,
  groundedSuggestionInputSchema,
  historyPageSchema,
  insightResponseSchema,
  insightSchema,
  meetingPayloadSchema,
  updateContactPayloadSchema,
  type ActionCard,
  type ActionPatchRequest,
  type AnalysisDraft,
  type ExecutionResultRequest,
  type GroundedSuggestionInput,
  type HistoryPage,
  type HistoryQuery,
  type Insight,
  type InsightEvidence,
  type Intake,
} from '@littletask/contracts';
import { assertActionTransition, deriveInsights } from '@littletask/domain';
import { z } from 'zod';

import type {
  AIProvider,
  AnalyzeInput,
  ClaimedAnalysisJob,
  ClaimedSuggestionJob,
  GroundedSuggestionDraft,
  IntakeStore,
  ModelRunRecord,
  ModelResult,
  ModelTelemetry,
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

const retryableModelErrors = new Set([
  'MODEL_GATEWAY_ERROR',
  'MODEL_GATEWAY_UNAVAILABLE',
  'MODEL_RATE_LIMITED',
]);

const historyCursorSchema = z.object({
  createdAt: z.string().datetime({ offset: true }),
  id: z.string().uuid(),
});

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

  async create(userId: string, input: CreateIntakeInput): Promise<Intake> {
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

    await this.store.create(userId, intake, input, this.options.maxJobAttempts);
    if (this.options.inlineWorker) this.scheduleInlineWorker();
    return intake;
  }

  async get(userId: string, id: string): Promise<Intake> {
    const intake = await this.store.get(userId, id);
    if (!intake) {
      throw new DomainError('INTAKE_NOT_FOUND', 'Intake not found', 404);
    }
    return intake;
  }

  list(userId: string): Promise<Intake[]> {
    return this.store.list(userId);
  }

  async listHistory(userId: string, request: HistoryQuery): Promise<HistoryPage> {
    const before = request.cursor ? this.decodeHistoryCursor(request.cursor) : undefined;
    const page = await this.store.listHistory(userId, {
      limit: request.limit,
      ...(before ? { before } : {}),
    });
    const tail = page.items.at(-1);
    return historyPageSchema.parse({
      items: page.items,
      nextCursor:
        page.hasMore && tail
          ? Buffer.from(JSON.stringify({ createdAt: tail.createdAt, id: tail.id })).toString(
              'base64url',
            )
          : null,
    });
  }

  async getActivity(userId: string, intakeId: string) {
    await this.get(userId, intakeId);
    return activityResponseSchema.parse({
      items: await this.store.listActivity(userId, intakeId),
    });
  }

  getDataSummary(userId: string) {
    return this.store.getDataSummary(userId);
  }

  async delete(userId: string, id: string): Promise<void> {
    if (!(await this.store.delete(userId, id))) {
      throw new DomainError('INTAKE_NOT_FOUND', 'Intake not found', 404);
    }
  }

  async deleteAll(userId: string) {
    return clearAllDataResponseSchema.parse({
      deletedIntakes: await this.store.deleteAll(userId),
    });
  }

  async patchAction(
    userId: string,
    actionId: string,
    request: ActionPatchRequest,
  ): Promise<ActionCard> {
    const { intake, actionIndex, action } = await this.findAction(userId, actionId);
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
    await this.store.replace(userId, { ...intake, actions, updatedAt: updated.updatedAt }, 'user');
    return updated;
  }

  async confirmAction(
    userId: string,
    actionId: string,
    expectedRevision: number,
    idempotencyKey: string,
  ): Promise<ActionCard> {
    const { intake, actionIndex, action } = await this.findAction(userId, actionId);
    const previousActionId = await this.store.getConfirmation(userId, idempotencyKey);
    if (previousActionId && previousActionId !== actionId) {
      throw new DomainError(
        'IDEMPOTENCY_CONFLICT',
        'Idempotency key belongs to another action',
        409,
      );
    }

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
      userId,
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
    await this.store.replace(userId, nextIntake);
    await this.refreshDerivedInsights(userId, nextIntake);
    return updated;
  }

  async reportExecution(
    userId: string,
    actionId: string,
    request: ExecutionResultRequest,
  ): Promise<ActionCard> {
    const { intake, actionIndex, action } = await this.findAction(userId, actionId);
    const confirmedActionId = await this.store.getConfirmation(
      userId,
      request.confirmationIdempotencyKey ?? request.idempotencyKey,
    );
    if (confirmedActionId !== actionId) {
      throw new DomainError(
        'ACTION_NOT_CONFIRMED',
        'Action must be confirmed before execution',
        409,
      );
    }

    const existing = await this.store.getExecution(userId, request.idempotencyKey);
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
      (await this.store.recordExecution(userId, {
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
      await this.refreshDerivedInsights(userId, intake);
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
    await this.store.replace(userId, nextIntake);
    await this.refreshDerivedInsights(userId, nextIntake);
    return updated;
  }

  async getInsights(userId: string, intakeId: string) {
    await this.get(userId, intakeId);
    const [items, generation] = await Promise.all([
      this.store.getInsights(userId, intakeId),
      this.store.getSuggestionJobState(userId, intakeId),
    ]);
    return insightResponseSchema.parse({ items, generationStatus: generation.status });
  }

  private async refreshDerivedInsights(userId: string, intake: Intake): Promise<void> {
    const [relatedIntakes, executions] = await Promise.all([
      this.store.list(userId),
      this.store.listExecutionObservations(userId, intake.id),
    ]);
    const ruleInsights = deriveInsights(
      {
        intake,
        relatedIntakes: relatedIntakes.filter((candidate) => candidate.id !== intake.id),
        executions,
      },
      { createId: randomUUID, now: () => new Date() },
    );
    await this.store.setRuleInsights(userId, intake.id, ruleInsights);

    const suggestionInput = this.buildSuggestionInput(intake, ruleInsights);
    if (!suggestionInput) return;
    const inputHash = createHash('sha256').update(JSON.stringify(suggestionInput)).digest('hex');
    const enqueued = await this.store.enqueueSuggestionJob(
      userId,
      suggestionInput,
      inputHash,
      this.options.maxJobAttempts,
    );
    if (enqueued && this.options.inlineWorker) this.scheduleInlineWorker();
  }

  private buildSuggestionInput(
    intake: Intake,
    ruleInsights: Insight[],
  ): GroundedSuggestionInput | null {
    const succeededActions = intake.actions.filter((action) => action.status === 'succeeded');
    if (succeededActions.length === 0) return null;
    const actionIds = new Set(succeededActions.map((action) => action.id));
    const evidence: InsightEvidence[] = [];
    const evidenceKeys = new Set<string>();

    for (const insight of ruleInsights) {
      if (!insight.actionId || !actionIds.has(insight.actionId)) continue;
      for (const item of insight.evidence) {
        const key = JSON.stringify(item);
        if (evidenceKeys.has(key)) continue;
        evidenceKeys.add(key);
        evidence.push(item);
        if (evidence.length === 50) break;
      }
      if (evidence.length === 50) break;
    }
    if (evidence.length === 0) return null;

    return groundedSuggestionInputSchema.parse({
      intakeId: intake.id,
      locale: intake.locale,
      summary: intake.summary,
      actions: succeededActions.map((action) => ({ id: action.id, type: action.type })),
      evidence: evidence.map((value, index) => ({ id: `E${index + 1}`, value })),
    });
  }

  private decodeHistoryCursor(value: string) {
    try {
      return historyCursorSchema.parse(
        JSON.parse(Buffer.from(value, 'base64url').toString('utf8')),
      );
    } catch {
      throw new DomainError('INVALID_HISTORY_CURSOR', 'History cursor is invalid', 400);
    }
  }

  async processNextJob(workerId: string, staleAfterMs = this.options.jobLeaseMs): Promise<boolean> {
    const analysisJob = await this.store.claimAnalysisJob(workerId, staleAfterMs);
    if (analysisJob) {
      await this.processAnalysisJob(analysisJob);
      return true;
    }
    const suggestionJob = await this.store.claimSuggestionJob(workerId, staleAfterMs);
    if (!suggestionJob) return false;
    await this.processSuggestionJob(suggestionJob);
    return true;
  }

  private async processAnalysisJob(job: ClaimedAnalysisJob): Promise<void> {
    try {
      const current = await this.get(job.userId, job.intakeId);
      if (current.status === 'ready') {
        await this.store.completeAnalysisJob(job.jobId);
        return;
      }

      await this.store.replace(job.userId, {
        ...current,
        status: 'processing',
        error: null,
        updatedAt: new Date().toISOString(),
      });
      const draft = await this.runModelStage(job.intakeId, 'analysis', () =>
        this.provider.analyze(job),
      );
      const reviewed = await this.runModelStage(job.intakeId, 'review', () =>
        this.provider.review(job, draft),
      );
      const processing = await this.get(job.userId, job.intakeId);
      await this.store.replace(job.userId, this.materializeAnalysis(processing, reviewed), 'ai');
      await this.store.completeAnalysisJob(job.jobId);
    } catch (error) {
      const code = this.errorCode(error);
      if (retryableModelErrors.has(code) && job.attempt < job.maxAttempts) {
        const delayMs = Math.min(5 * 60_000, 1_000 * 2 ** (job.attempt - 1));
        await this.store.rescheduleAnalysisJob(job.jobId, delayMs, code);
      } else {
        await this.store.failAnalysisJob(job.jobId, code, this.safeAnalysisMessage(error));
      }
    }
  }

  private async processSuggestionJob(job: ClaimedSuggestionJob): Promise<void> {
    try {
      const drafts = await this.runModelStage(job.intakeId, 'insight', () =>
        this.provider.suggestInsights(job),
      );
      const currentInsights = await this.store.getInsights(job.userId, job.intakeId);
      const insights = this.materializeSuggestions(job, drafts, currentInsights);
      await this.store.completeSuggestionJob(job.jobId, job.generation, insights);
    } catch (error) {
      const code = this.errorCode(error, 'INSIGHT_GENERATION_FAILED');
      if (retryableModelErrors.has(code) && job.attempt < job.maxAttempts) {
        const delayMs = Math.min(5 * 60_000, 1_000 * 2 ** (job.attempt - 1));
        await this.store.rescheduleSuggestionJob(job.jobId, job.generation, delayMs, code);
      } else {
        await this.store.failSuggestionJob(job.jobId, job.generation, code);
      }
    }
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
    intakeId: string,
    stage: ModelRunRecord['stage'],
    run: () => Promise<ModelResult<T>>,
  ): Promise<T> {
    const startedAt = new Date();
    const started = Date.now();
    try {
      const result = await run();
      await this.recordModelRun(
        intakeId,
        stage,
        'succeeded',
        startedAt,
        started,
        result.telemetry,
        null,
      );
      return result.data;
    } catch (error) {
      try {
        await this.recordModelRun(
          intakeId,
          stage,
          'failed',
          startedAt,
          started,
          this.telemetryFromError(error),
          this.errorCode(
            error,
            stage === 'insight' ? 'INSIGHT_GENERATION_FAILED' : 'ANALYSIS_FAILED',
          ),
        );
      } catch {
        // Preserve the provider error; queue failure handling remains authoritative.
      }
      throw error;
    }
  }

  private recordModelRun(
    intakeId: string,
    stage: ModelRunRecord['stage'],
    status: ModelRunRecord['status'],
    startedAt: Date,
    started: number,
    telemetry: ModelTelemetry,
    errorCode: string | null,
  ): Promise<void> {
    return this.store.recordModelRun({
      id: randomUUID(),
      intakeId,
      stage,
      status,
      provider: this.options.providerName,
      model: stage === 'review' ? this.options.reviewModel : this.options.analysisModel,
      reasoningEffort: this.options.reasoningEffort,
      promptVersion: this.options.promptVersion,
      schemaVersion: this.options.schemaVersion,
      durationMs: Math.max(0, Date.now() - started),
      inputTokens: telemetry.inputTokens,
      outputTokens: telemetry.outputTokens,
      totalTokens: telemetry.totalTokens,
      responseId: telemetry.responseId,
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

  private materializeSuggestions(
    job: ClaimedSuggestionJob,
    drafts: GroundedSuggestionDraft[],
    currentInsights: Insight[],
  ): Insight[] {
    const actionIds = new Set(job.actions.map((action) => action.id));
    const evidence = new Map(job.evidence.map((item) => [item.id, item.value]));
    const seen = new Set(
      currentInsights.map((insight) =>
        this.suggestionKey(insight.actionId ?? null, insight.type, insight.title),
      ),
    );
    const createdAt = new Date().toISOString();
    const results: Insight[] = [];

    for (const draft of drafts) {
      if (draft.actionId !== null && !actionIds.has(draft.actionId)) continue;
      const evidenceIds = [...new Set(draft.evidenceIds)];
      const referencedEvidence = evidenceIds.flatMap((id) => {
        const value = evidence.get(id);
        return value ? [value] : [];
      });
      if (referencedEvidence.length !== evidenceIds.length) continue;
      const key = this.suggestionKey(draft.actionId, draft.type, draft.title);
      if (seen.has(key)) continue;
      const parsed = insightSchema.safeParse({
        id: randomUUID(),
        intakeId: job.intakeId,
        ...(draft.actionId === null ? {} : { actionId: draft.actionId }),
        type: draft.type,
        kind: 'suggestion',
        generator: 'model',
        priority: draft.priority,
        title: draft.title,
        body: draft.body,
        evidence: referencedEvidence,
        createdAt,
      });
      if (!parsed.success) continue;
      seen.add(key);
      results.push(parsed.data);
      if (results.length === 4) break;
    }
    return results;
  }

  private suggestionKey(actionId: string | null, type: string, title: string): string {
    return `${actionId ?? 'intake'}:${type}:${title.trim().toLocaleLowerCase()}`;
  }

  private async findAction(
    userId: string,
    actionId: string,
  ): Promise<{
    intake: Intake;
    actionIndex: number;
    action: ActionCard;
  }> {
    for (const intake of await this.store.list(userId)) {
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

  private errorCode(error: unknown, fallback = 'ANALYSIS_FAILED'): string {
    if (typeof error === 'object' && error !== null && 'code' in error) {
      const code = String(error.code);
      if (/^[A-Z][A-Z0-9_]{1,79}$/.test(code)) return code;
    }
    return fallback;
  }

  private telemetryFromError(error: unknown): ModelTelemetry {
    if (typeof error !== 'object' || error === null || !('telemetry' in error)) {
      return emptyTelemetry();
    }
    const telemetry = error.telemetry;
    if (typeof telemetry !== 'object' || telemetry === null) return emptyTelemetry();
    return {
      responseId: this.safeResponseId('responseId' in telemetry ? telemetry.responseId : null),
      inputTokens: this.safeTokenCount('inputTokens' in telemetry ? telemetry.inputTokens : null),
      outputTokens: this.safeTokenCount(
        'outputTokens' in telemetry ? telemetry.outputTokens : null,
      ),
      totalTokens: this.safeTokenCount('totalTokens' in telemetry ? telemetry.totalTokens : null),
    };
  }

  private safeResponseId(value: unknown): string | null {
    return typeof value === 'string' && /^[A-Za-z0-9_-]{1,255}$/.test(value) ? value : null;
  }

  private safeTokenCount(value: unknown): number | null {
    return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 2_147_483_647
      ? Number(value)
      : null;
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

function emptyTelemetry(): ModelTelemetry {
  return { responseId: null, inputTokens: null, outputTokens: null, totalTokens: null };
}
